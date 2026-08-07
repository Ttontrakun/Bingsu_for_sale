param(
  [string]$TaskName = "BingsuDailyBackup",
  [string]$Time = "02:00"
)

$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "run-scheduled-backup.ps1"
if (-not (Test-Path $launcher)) {
  throw "Missing launcher: $launcher"
}

$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
Write-Host "[backup-task] Registering '$TaskName' daily at $Time (SYSTEM)"
# /RU SYSTEM = รันแม้ไม่มีใครล็อกอิน
schtasks /Create /TN $TaskName /SC DAILY /ST $Time /TR $action /RU SYSTEM /RL HIGHEST /F | Out-Host
Write-Host "[backup-task] Done. List with: schtasks /Query /TN $TaskName /V /FO LIST"
