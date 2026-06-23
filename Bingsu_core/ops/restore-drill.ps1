param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$ComposeFile = ".\Docker-compose.yml",
  [string]$RestoreDbName = "ask_the_manual_restore_check",
  [string]$DbUser = "postgres",
  [string]$EncryptionKey = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host "[restore-drill] $message"
}

function Unprotect-FileAes([string]$Path, [string]$KeyMaterial) {
  if (-not (Test-Path $Path)) { return $null }
  if (-not $Path.EndsWith(".enc")) { return $Path }
  if ([string]::IsNullOrWhiteSpace($KeyMaterial)) {
    throw "Encrypted backup requires -EncryptionKey"
  }
  $payload = [System.IO.File]::ReadAllBytes($Path)
  $header = [System.Text.Encoding]::UTF8.GetBytes("BINGSU-AES1")
  for ($i = 0; $i -lt $header.Length; $i++) {
    if ($payload[$i] -ne $header[$i]) { throw "Invalid encrypted backup header: $Path" }
  }
  $offset = $header.Length
  $salt = New-Object byte[] 16
  $iv = New-Object byte[] 16
  [Array]::Copy($payload, $offset, $salt, 0, 16)
  [Array]::Copy($payload, $offset + 16, $iv, 0, 16)
  $cipherLen = $payload.Length - $offset - 32
  $cipher = New-Object byte[] $cipherLen
  [Array]::Copy($payload, $offset + 32, $cipher, 0, $cipherLen)

  $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($KeyMaterial, $salt, 100000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $key = $kdf.GetBytes(32)
  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $key
  $aes.IV = $iv
  $decryptor = $aes.CreateDecryptor()
  $plain = $decryptor.TransformFinalBlock($cipher, 0, $cipher.Length)

  $outPath = Join-Path $env:TEMP ("restore-" + [System.IO.Path]::GetRandomFileName() + ".sql")
  [System.IO.File]::WriteAllBytes($outPath, $plain)
  return $outPath
}

if (-not (Test-Path $BackupPath)) {
  throw "Backup path not found: $BackupPath"
}

$postgresDumpPath = Join-Path $BackupPath "postgres.sql"
if (-not (Test-Path $postgresDumpPath)) {
  $postgresDumpPath = Join-Path $BackupPath "postgres.sql.enc"
}
if (-not (Test-Path $postgresDumpPath)) {
  throw "postgres.sql(.enc) not found in backup path: $BackupPath"
}
$postgresRestorePath = Unprotect-FileAes -Path $postgresDumpPath -KeyMaterial $EncryptionKey

Write-Step "Preparing temporary database: $RestoreDbName"
docker compose -f $ComposeFile exec -T postgres sh -lc "PGPASSWORD=postgres dropdb -U $DbUser --if-exists $RestoreDbName"
docker compose -f $ComposeFile exec -T postgres sh -lc "PGPASSWORD=postgres createdb -U $DbUser $RestoreDbName"

Write-Step "Restoring PostgreSQL dump"
Get-Content -Path $postgresRestorePath -Raw |
  docker compose -f $ComposeFile exec -T postgres psql -U $DbUser -d $RestoreDbName | Out-Null

Write-Step "Running restore verification queries"
$userCount = docker compose -f $ComposeFile exec -T postgres psql -U $DbUser -d $RestoreDbName -t -c "SELECT COUNT(*) FROM \"User\";" 
$chatCount = docker compose -f $ComposeFile exec -T postgres psql -U $DbUser -d $RestoreDbName -t -c "SELECT COUNT(*) FROM \"Chat\";"

Write-Host "[restore-drill] User rows:$($userCount.Trim())"
Write-Host "[restore-drill] Chat rows:$($chatCount.Trim())"

Write-Step "Dropping temporary restore database"
docker compose -f $ComposeFile exec -T postgres sh -lc "PGPASSWORD=postgres dropdb -U $DbUser --if-exists $RestoreDbName"

if ($postgresRestorePath -and $postgresRestorePath -ne $postgresDumpPath -and (Test-Path $postgresRestorePath)) {
  Remove-Item -Path $postgresRestorePath -Force
}

Write-Step "Restore drill completed successfully"
