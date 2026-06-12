# Bingsu Database Management

Orchestrator สำหรับจัดการทั้ง Relation Database (PostgreSQL) และ Vector Database (Qdrant) พร้อมกัน

## โครงสร้าง

```
Database/
├── Management/     # Orchestrator - จัดการทั้ง PostgreSQL และ Qdrant
│   └── docker-compose.yml    # รวม PostgreSQL + Qdrant
├── PostgreSQL/     # PostgreSQL Database
│   ├── docker-compose.yml    # PostgreSQL container
│   ├── schema.prisma         # Prisma schema
│   └── migrations/           # Prisma migrations
└── Qdrant/         # Qdrant Database
    ├── docker-compose.yml    # Qdrant container
    └── qdrant.js             # Qdrant service
```

## วิธีใช้งาน

### เริ่มทั้ง PostgreSQL และ Qdrant พร้อมกัน

```bash
npm start
```

หรือ

```bash
docker compose up -d
```

### หยุดทั้งสอง

```bash
npm stop
```

หรือ

```bash
docker compose down
```

### ดู logs

```bash
# ทั้งสอง
npm run logs

# เฉพาะ PostgreSQL
npm run logs:postgres

# เฉพาะ Qdrant
npm run logs:qdrant
```

### ตรวจสอบสถานะ

```bash
npm run status
```

## คำสั่งเพิ่มเติม

### จัดการเฉพาะ PostgreSQL
```bash
npm run postgres:start    # เริ่ม PostgreSQL
npm run postgres:stop     # หยุด PostgreSQL
npm run postgres:migrate  # รัน migrations
```

### จัดการเฉพาะ Qdrant
```bash
npm run qdrant:start  # เริ่ม Qdrant
npm run qdrant:stop   # หยุด Qdrant
```

## การตั้งค่า

### PostgreSQL
- Port: `5433`
- User: `bingsu_user`
- Password: `bingsu_password`
- Database: `bingsu_db`
- ดูรายละเอียดเพิ่มเติม: `../PostgreSQL/README.md`

### Qdrant
- HTTP API: `http://localhost:6333`
- gRPC API: `localhost:6334`
- ดูรายละเอียดเพิ่มเติม: `../Qdrant/README.md`

## หมายเหตุ

- **Management** เป็น orchestrator ที่จัดการทั้งสอง databases พร้อมกัน
- **PostgreSQL/** มี Prisma schema และ migrations สำหรับ PostgreSQL
- **Qdrant/** มี Qdrant service สำหรับ vector database
- สำหรับจัดการเฉพาะ database เดียว ให้ไปที่ PostgreSQL/ หรือ Qdrant/ แทน
- Data จะถูก persist ใน Docker volumes
