# Enterprise AI Chatbot Nginx Configuration

Nginx reverse proxy configuration สำหรับ development และ production

## ไฟล์

### `default.conf` - Development
- Reverse proxy สำหรับ frontend (Vite dev server)
- Reverse proxy สำหรับ FastAPI (`/api/`)
- รองรับ WebSocket สำหรับ Vite HMR

### `default.prod.conf` - Production
- Serve static files จาก build output
- Reverse proxy สำหรับ FastAPI (`/api/`)
- รองรับ Swagger UI (`/docs`, `/redoc`)
- SPA routing fallback
- ตั้งค่า `client_max_body_size` สำหรับ upload ไฟล์ใหญ่ (250MB)
- ตั้งค่า timeout สำหรับ long-running requests (300s)

## การใช้งาน

### Development (Docker Compose)

```yaml
nginx:
  image: nginx:alpine
  ports:
    - "8080:80"
  volumes:
    - ./Service/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
  depends_on:
    - frontend
    - api
```

### Production (Dockerfile)

```dockerfile
FROM nginx:alpine
COPY Service/nginx/default.prod.conf /etc/nginx/conf.d/default.conf
COPY --from=build /frontend/build /usr/share/nginx/html
```

## Features

- ✅ Reverse proxy สำหรับ frontend และ API
- ✅ WebSocket support สำหรับ Vite HMR
- ✅ SPA routing fallback
- ✅ Swagger UI support
- ✅ Large file upload support (250MB)
- ✅ Long-running request timeout (300s)
- ✅ Cache control headers
