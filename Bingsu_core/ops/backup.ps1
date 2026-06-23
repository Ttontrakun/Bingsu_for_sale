param(
  [string]$BackupRoot = ".\backups",
  [string]$ComposeFile = ".\Docker-compose.yml",
  [string]$DbName = "ask_the_manual",
  [string]$DbUser = "postgres",
  [string]$EncryptionKey = "",
  [bool]$RestrictAcl = $true
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host "[backup] $message"
}

function Protect-FileAes([string]$Path, [string]$KeyMaterial) {
  if (-not (Test-Path $Path)) { return $null }
  if ([string]::IsNullOrWhiteSpace($KeyMaterial)) { return $Path }

  $plain = [System.IO.File]::ReadAllBytes($Path)
  $salt = New-Object byte[] 16
  $iv = New-Object byte[] 16
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($salt)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($iv)
  $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($KeyMaterial, $salt, 100000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $key = $kdf.GetBytes(32)

  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $key
  $aes.IV = $iv
  $encryptor = $aes.CreateEncryptor()
  $cipher = $encryptor.TransformFinalBlock($plain, 0, $plain.Length)

  $output = Join-Path (Split-Path -Parent $Path) ((Split-Path -Leaf $Path) + ".enc")
  $header = [System.Text.Encoding]::UTF8.GetBytes("BINGSU-AES1")
  $payload = New-Object byte[] ($header.Length + $salt.Length + $iv.Length + $cipher.Length)
  [Array]::Copy($header, 0, $payload, 0, $header.Length)
  [Array]::Copy($salt, 0, $payload, $header.Length, $salt.Length)
  [Array]::Copy($iv, 0, $payload, $header.Length + $salt.Length, $iv.Length)
  [Array]::Copy($cipher, 0, $payload, $header.Length + $salt.Length + $iv.Length, $cipher.Length)
  [System.IO.File]::WriteAllBytes($output, $payload)
  Remove-Item -Path $Path -Force
  return $output
}

function Restrict-BackupAcl([string]$PathToProtect) {
  if (-not (Test-Path $PathToProtect)) { return }
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $null = icacls $PathToProtect /inheritance:r
  $null = icacls $PathToProtect /grant:r "${currentUser}:(OI)(CI)F" "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$targetDir = Join-Path $BackupRoot $timestamp
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$postgresDumpPath = Join-Path $targetDir "postgres.sql"
$manifestPath = Join-Path $targetDir "manifest.json"

Write-Step "Creating PostgreSQL dump to $postgresDumpPath"
docker compose -f $ComposeFile exec -T postgres sh -lc "PGPASSWORD=postgres pg_dump -U $DbUser $DbName" |
  Out-File -Encoding utf8 $postgresDumpPath
$postgresStoredPath = Protect-FileAes -Path $postgresDumpPath -KeyMaterial $EncryptionKey

Write-Step "Creating Qdrant snapshots"
$qdrantSnapshots = @()
try {
  $collectionsResp = Invoke-RestMethod -Method Get -Uri "http://localhost:6336/collections"
  $collections = @($collectionsResp.result.collections.name)
  foreach ($collectionName in $collections) {
    Write-Step "Creating snapshot for collection: $collectionName"
    $snapshotResp = Invoke-RestMethod -Method Post -Uri "http://localhost:6336/collections/$collectionName/snapshots"
    $snapshotName = $snapshotResp.result.name
    if (-not $snapshotName) { continue }
    $snapshotFile = Join-Path $targetDir "$collectionName-$snapshotName.snapshot"
    Invoke-WebRequest -Uri "http://localhost:6336/collections/$collectionName/snapshots/$snapshotName" -OutFile $snapshotFile
    $storedSnapshot = Protect-FileAes -Path $snapshotFile -KeyMaterial $EncryptionKey
    $qdrantSnapshots += [PSCustomObject]@{
      collection = $collectionName
      snapshot   = $snapshotName
      file       = [System.IO.Path]::GetFileName($storedSnapshot)
      encrypted  = -not [string]::IsNullOrWhiteSpace($EncryptionKey)
      sha256     = (Get-FileHash -Path $storedSnapshot -Algorithm SHA256).Hash
    }
  }
} catch {
  Write-Warning "[backup] Qdrant snapshot failed: $($_.Exception.Message)"
}

$manifest = [PSCustomObject]@{
  createdAt = (Get-Date).ToString("o")
  postgres = [PSCustomObject]@{
    database = $DbName
    user = $DbUser
    file = [System.IO.Path]::GetFileName($postgresStoredPath)
    encrypted = -not [string]::IsNullOrWhiteSpace($EncryptionKey)
    sha256 = (Get-FileHash -Path $postgresStoredPath -Algorithm SHA256).Hash
  }
  qdrant = $qdrantSnapshots
}

$manifest | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 $manifestPath
if ($RestrictAcl) {
  Write-Step "Applying restrictive ACL to backup directory"
  Restrict-BackupAcl -PathToProtect $targetDir
}
Write-Step "Backup completed: $targetDir"
