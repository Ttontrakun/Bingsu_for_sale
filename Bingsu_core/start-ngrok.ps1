# สตาร์ท ngrok ใน Docker (ต้องมี NGROK_AUTHTOKEN ใน Backend/.env)
# หลังรันเสร็จ เปิด http://localhost:4040 เพื่อดู URL สำหรับ LINE Webhook

Set-Location $PSScriptRoot

Write-Host "Pulling ngrok image..." -ForegroundColor Yellow
docker compose --profile ngrok pull ngrok
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting ngrok..." -ForegroundColor Yellow
docker compose --profile ngrok up -d ngrok
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Open http://localhost:4040 to see your public URL (for LINE Webhook)." -ForegroundColor Green
Write-Host "Webhook URL will be: https://xxx.ngrok-free.dev/api/webhooks/line" -ForegroundColor Cyan
