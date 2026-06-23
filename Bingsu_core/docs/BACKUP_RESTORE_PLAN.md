# Backup and Restore Plan

This runbook defines automatic backup, retention, and restore drill for `PostgreSQL` and `Qdrant`.

## Scope

- PostgreSQL database: `ask_the_manual`
- Qdrant collections (all collections returned from API)
- Backup scripts:
  - `ops/backup.ps1`
  - `ops/restore-drill.ps1`

## Backup Schedule

- Frequency: every 6 hours
- Minimum retention: 7 days
- Recommended retention: 30 days
- Store backups outside the project disk when possible

## Run Backup Manually

```powershell
cd "C:\Users\Administrator\Enterprise AI Chatbot_for_sale\Enterprise AI Chatbot_core"
powershell -ExecutionPolicy Bypass -File ".\ops\backup.ps1" -BackupRoot ".\backups" -EncryptionKey "<strong-passphrase>"
```

Output folder format:

- `backups\yyyyMMdd_HHmmss\postgres.sql` (or `postgres.sql.enc` when encrypted)
- `backups\yyyyMMdd_HHmmss\*.snapshot` (or `*.snapshot.enc` when encrypted)
- `backups\yyyyMMdd_HHmmss\manifest.json`

Security controls included in `ops/backup.ps1`:

- Optional AES encryption by providing `-EncryptionKey`
- Restricted ACL on backup folder to current Windows user + `Administrators` + `SYSTEM`

## Restore Drill (PostgreSQL)

Run weekly restore drill against a temporary database:

```powershell
cd "C:\Users\Administrator\Enterprise AI Chatbot_for_sale\Enterprise AI Chatbot_core"
powershell -ExecutionPolicy Bypass -File ".\ops\restore-drill.ps1" -BackupPath ".\backups\yyyyMMdd_HHmmss" -EncryptionKey "<strong-passphrase>"
```

This verifies:

- SQL backup can be restored
- Core tables are readable after restore
- Restore database can be cleaned up successfully

## Windows Task Scheduler (Automatic Backup)

Create task command:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\Administrator\Enterprise AI Chatbot_for_sale\Enterprise AI Chatbot_core\ops\backup.ps1" -BackupRoot "C:\Users\Administrator\Enterprise AI Chatbot_for_sale\Enterprise AI Chatbot_core\backups" -EncryptionKey "<strong-passphrase>"
```

Recommended trigger:

- Daily, repeat every 6 hours, indefinitely

## Retention Cleanup (Optional)

Add cleanup step (example: keep 30 days):

```powershell
Get-ChildItem "C:\Users\Administrator\Enterprise AI Chatbot_for_sale\Enterprise AI Chatbot_core\backups" -Directory |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Recurse -Force
```

## Qdrant Restore Notes

- Snapshot files are produced in each backup run.
- Restore should be done in maintenance window.
- Standard sequence:
  1. Stop write traffic
  2. Restore target collection snapshot in Qdrant
  3. Validate collection health and query behavior
  4. Resume traffic

## Operational Checklist

- Backup job status checked daily
- Restore drill completed weekly
- Manifest SHA256 hashes validated when moving backup files
- Incident runbook owner assigned
