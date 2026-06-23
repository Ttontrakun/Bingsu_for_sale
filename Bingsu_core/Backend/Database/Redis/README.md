# Enterprise AI Chatbot Redis Database

Redis service for queue and caching.

## Setup

### 1. Start Redis with Docker

```bash
cd Database/Redis
docker compose up -d
```

### 2. Verify Redis is running

```bash
# Check logs
docker compose logs -f

# Test connection
redis-cli -h localhost -p 6379 ping
# Should return: PONG
```

### 3. Stop Redis

```bash
docker compose down
```

## Configuration

Set environment variables in parent directory `.env`:

```env
REDIS_URL="redis://localhost:6379"
RATE_LIMIT_REDIS_PREFIX="rate"
```

## Usage

See `Service/Redis/` for Redis client usage.

## Port

- Default: `6379`
- Change in `docker-compose.yml` if needed
