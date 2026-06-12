# Bingsu Redis Service

Redis service สำหรับ queue และ caching

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in parent directory:

```env
# Redis
REDIS_URL="redis://localhost:6379"
RATE_LIMIT_REDIS_PREFIX="rate"
```

## Usage

```javascript
import { getRedisClient, isRedisReady } from "./redis.js";

// Check if Redis is ready
if (isRedisReady()) {
  const client = getRedisClient();
  
  // Queue operations
  await client.lPush("queue:name", "item");
  const result = await client.brPop("queue:name", 0);
  
  // Cache operations
  await client.set("key", "value", { EX: 60 }); // TTL 60 seconds
  const value = await client.get("key");
}
```

## Features

- ✅ Redis client connection management
- ✅ Auto-connect on initialization
- ✅ Error handling
- ✅ Ready state checking

## Dependencies

- `redis` - Redis client for Node.js
- `dotenv` - For environment variables

## Notes

- Redis client จะ connect อัตโนมัติเมื่อมี `REDIS_URL`
- ใช้ `isRedisReady()` เพื่อตรวจสอบว่า Redis พร้อมใช้งานหรือไม่
- ใช้ `getRedisClient()` เพื่อดึง Redis client instance
