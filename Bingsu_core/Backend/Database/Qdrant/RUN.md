# วิธีรัน Qdrant Vector Database

## วิธีที่ 1: ใช้ Docker (แนะนำ)

### 1. เริ่ม Qdrant ด้วย Docker Compose

```bash
# เริ่ม Qdrant
npm run start:qdrant

# หรือ
docker-compose up -d
```

### 2. ตรวจสอบว่า Qdrant รันอยู่

```bash
# ดู logs
npm run logs:qdrant

# หรือเปิด browser ไปที่
# http://localhost:6333/dashboard
```

### 3. ทดสอบ Qdrant

```bash
# ติดตั้ง dependencies ก่อน (ถ้ายังไม่ได้ติดตั้ง)
cd ../../Service/Rag
npm install

# กลับมาที่ Qdrant directory
cd ../../Database/Qdrant

# รัน test
npm test
```

### 4. หยุด Qdrant

```bash
npm run stop:qdrant

# หรือ
docker-compose down
```

## วิธีที่ 2: ติดตั้ง Qdrant โดยตรง

### macOS (ใช้ Homebrew)

```bash
brew install qdrant
qdrant
```

### Linux

```bash
# Download binary
wget https://github.com/qdrant/qdrant/releases/download/v1.7.0/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
./qdrant
```

### Windows

Download จาก: https://github.com/qdrant/qdrant/releases

## ตรวจสอบการทำงาน

### 1. Health Check

```bash
curl http://localhost:6333/health
```

ควรได้ response:
```json
{"status":"ok"}
```

### 2. ดู Collections

```bash
curl http://localhost:6333/collections
```

### 3. เปิด Qdrant Dashboard

เปิด browser ไปที่: http://localhost:6333/dashboard

## Environment Variables

สร้างไฟล์ `.env` ใน parent directory (`bingsu/Backend/`) หรือ set environment variables:

```env
QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY=""  # Optional
QDRANT_COLLECTION="documents"
QDRANT_DISTANCE="Cosine"
QDRANT_TOP_K="6"
```

## Troubleshooting

### Qdrant ไม่สามารถเชื่อมต่อได้

1. ตรวจสอบว่า Qdrant รันอยู่:
```bash
curl http://localhost:6333/health
```

2. ตรวจสอบ port 6333 ว่าถูกใช้งานหรือไม่:
```bash
lsof -i :6333
```

3. ตรวจสอบ Docker container:
```bash
docker ps
docker logs qdrant
```

### Port 6333 ถูกใช้งานแล้ว

แก้ไข `docker-compose.yml`:
```yaml
ports:
  - "6335:6333"  # เปลี่ยน port
```

และอัปเดต `QDRANT_URL` ใน `.env`:
```env
QDRANT_URL="http://localhost:6335"
```
