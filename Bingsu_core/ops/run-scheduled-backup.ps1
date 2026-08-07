# Launcher for Task Scheduler — always runs from Bingsu_core
$ErrorActionPreference = "Stop"
$CoreRoot = Split-Path -Parent $PSScriptRoot
Set-Location $CoreRoot
& (Join-Path $PSScriptRoot "backup.ps1") -BackupRoot (Join-Path $CoreRoot "backups") -ComposeFile (Join-Path $CoreRoot "Docker-compose.yml")
