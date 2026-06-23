# Seed Admin/Support Runbook

Script: `Backend/server/scripts/seed-admins.js`

## Modes

- `bootstrap` (default): create admin/support if missing, never overwrite existing account password.
- `dry-run`: show what would happen, no data change.
- `reset`: reset existing admin/support password (requires `--force-reset`).

## Required environment variables

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_SUPPORT_EMAIL`
- `SEED_SUPPORT_PASSWORD`
- optional: `SEED_ADMIN_NAME`, `SEED_SUPPORT_NAME`

Password policy enforced by script:

- min length 12
- must include uppercase, lowercase, number, symbol

## Production safety

- If `NODE_ENV=production`, script refuses to run unless `ALLOW_PROD_SEED=true`.

## Examples

Dry run:

```powershell
cd "C:\Users\Administrator\Enterprise AI Chatbot_for_sale\Enterprise AI Chatbot_core\Backend"
$env:SEED_ADMIN_EMAIL="admin@example.com"
$env:SEED_ADMIN_PASSWORD="<strong>"
$env:SEED_SUPPORT_EMAIL="support@example.com"
$env:SEED_SUPPORT_PASSWORD="<strong>"
npm run seed:admins:dry-run
```

Bootstrap:

```powershell
npm run seed:admins
```

Reset (intentional):

```powershell
npm run seed:admins:reset
```
