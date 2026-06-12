# Backend (format) — ใช้โค้ด ask_AA backend

โฟลเดอร์ **Backend** นี้เป็น **format โครง Backend** (Database, Service/...) แต่ใช้โค้ดจาก **ask_aa backend** (เดิมอยู่ที่ askaa_backend):

- **Backend/server/** — Node/Express (auth, documents, bots, chat, upload) จาก askaa_backend
- **Backend/Service/Website/** — FastAPI (API gateway, OCR, proxy ไป legacy) จาก askaa_backend/backend
- **Backend/prisma/** — Prisma schema + migrations
- **Backend/nginx/** — config nginx สำหรับ production
- **Backend/package.json** — dependencies ของ Node

## รันด้วย Docker (จากโฟลเดอร์ bb)

```bash
cd bb
copy Backend\env.sample Backend\.env
# แก้ Backend/.env ใส่ API keys ตามต้องการ
docker compose up -d --build
```

เปิดเว็บที่ **http://localhost:8083**

## แก้ไขโค้ด

- แก้ **Node (legacy/worker)** ที่ `Backend/server/`
- แก้ **FastAPI (api)** ที่ `Backend/Service/Website/app/`
- ใส่ env ที่ `Backend/.env` หรือ `Backend/.env.local`
