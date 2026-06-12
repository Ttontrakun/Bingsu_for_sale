# Bingsu PostgreSQL Database

PostgreSQL relational database with Prisma ORM.

## 📁 Files

- `schema.prisma` - Prisma schema definition
- `migrations/` - Database migrations
- `package.json` - Prisma dependencies

## ⚠️ Docker Setup

**Note**: For Docker setup, use `Database/Management/docker-compose.yml` which orchestrates PostgreSQL, Qdrant, and Redis together.

If you need to run PostgreSQL separately, you can use the docker-compose.yml in this directory, but it's recommended to use Management for consistency.

## 🔧 Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Database URL

**Prisma จะหา `DATABASE_URL` จาก:**
1. `.env` file ใน directory นี้ (`Backend/Database/PostgreSQL/.env`)
2. Parent directories (`.env` ใน `Backend/` หรือ root)

**วิธีที่ 1: สร้าง .env ใน directory นี้ (แนะนำ)**
```bash
cd Backend/Database/PostgreSQL
echo 'DATABASE_URL="postgresql://bingsu_user:bingsu_password@localhost:5433/bingsu_db?schema=public"' > .env
```

**วิธีที่ 2: ใช้ .env จาก root**
```bash
# ตรวจสอบว่า root .env มี DATABASE_URL
cd ../../..
cat .env | grep DATABASE_URL
```

**Default Docker credentials:**
```env
DATABASE_URL="postgresql://bingsu_user:bingsu_password@localhost:5433/bingsu_db?schema=public"
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Run Migrations

```bash
# Development (creates migration)
npx prisma migrate dev

# Production (applies existing migrations)
npx prisma migrate deploy
```

### 5. Open Prisma Studio (Optional)

```bash
npx prisma studio
```

## 📊 Schema

See `schema.prisma` for the complete database schema.

Main models:
- `User` - User accounts
- `Credential` - User credentials (separate table)
- `Chat` - Chat rooms
- `ChatUser` - Chat membership
- `ChatMessage` - Chat messages

## 🔍 Prisma Commands

```bash
# Generate Prisma Client
npx prisma generate

# Create new migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (⚠️ deletes all data)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio

# Format schema
npx prisma format

# Validate schema
npx prisma validate
```

## 🐳 Docker (Standalone)

If you need to run PostgreSQL separately:

```bash
docker compose up -d
```

**Recommended**: Use `Database/Management/docker-compose.yml` instead.
