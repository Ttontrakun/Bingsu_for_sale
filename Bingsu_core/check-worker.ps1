# ตรวจสอบ Docker และบริการ (Worker, Legacy, Redis, Web) สำหรับ Enterprise AI Chatbot Plus
# รันจากโฟลเดอร์ bingsu_plus: .\check-worker.ps1
# หรือ double-click ไฟล์ check-worker.bat

$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ตรวจสอบ Enterprise AI Chatbot Plus (Docker)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Docker
Write-Host "[1] Docker" -ForegroundColor Yellow
try {
    $null = docker version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    ไม่พบ Docker หรือ Docker ไม่ได้รัน — เปิด Docker Desktop แล้วลองใหม่" -ForegroundColor Red
    } else {
        Write-Host "    OK — Docker พร้อมใช้" -ForegroundColor Green
    }
} catch {
    Write-Host "    ไม่พบคำสั่ง docker — ติดตั้ง Docker Desktop ก่อน" -ForegroundColor Red
}
Write-Host ""

# 2. ไฟล์ .env
Write-Host "[2] ไฟล์ env (askaa_backend\.env)" -ForegroundColor Yellow
$envPath = Join-Path $here "askaa_backend\.env"
if (Test-Path $envPath) {
    Write-Host '    OK — มีไฟล์ .env' -ForegroundColor Green
} else {
    Write-Host '    ไม่พบ .env — copy askaa_backend\env.sample เป็น askaa_backend\.env' -ForegroundColor Red
}
Write-Host ""

# 3. docker compose ps
Write-Host "[3] สถานะ Container (docker compose ps)" -ForegroundColor Yellow
docker compose ps -a
$psOut = docker compose ps -a 2>&1 | Out-String
$workerRunning = $psOut -match "worker" -and $psOut -match "Up"
$webRunning = $psOut -match "web" -and $psOut -match "Up"
if (-not $workerRunning) {
    Write-Host ""
    Write-Host '    >>> Worker ไม่รัน — อัปโหลดเอกสารจะค้าง' -ForegroundColor Red
    Write-Host '    >>> รัน: docker compose up -d' -ForegroundColor Cyan
} else {
    Write-Host '    Worker รันอยู่ — ถ้าอัปโหลดยังค้าง ดู log ด้านล่าง' -ForegroundColor Green
}
if (-not $webRunning) {
    Write-Host '    >>> Web ไม่รัน — เปิด http://localhost ไม่ได้' -ForegroundColor Red
    Write-Host '    >>> รัน: docker compose up -d web' -ForegroundColor Cyan
}
Write-Host ""

# 4. Log worker
Write-Host "[4] Log Worker (15 บรรทัดล่าสุด)" -ForegroundColor Yellow
$logOutput = docker compose logs worker --tail 15 2>&1
if ($logOutput) {
    Write-Host $logOutput
} else {
    Write-Host '    ไม่มี log หรือยังไม่มี container worker' -ForegroundColor Gray
}
Write-Host ""

# 5. สรุป
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " สรุป" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host '  ถ้า Worker รันอยู่ แต่อัปโหลดยังค้าง: ดู log ด้านบน หรือรัน' -ForegroundColor White
Write-Host '    docker compose logs -f worker' -ForegroundColor Cyan
Write-Host '  ถ้าต้องการให้ป้าย Paddle+LLM ขึ้น: เปิด Ollama บนเครื่อง' -ForegroundColor White
Write-Host '    ollama serve แล้ว ollama pull llama3.2' -ForegroundColor Cyan
Write-Host ""
