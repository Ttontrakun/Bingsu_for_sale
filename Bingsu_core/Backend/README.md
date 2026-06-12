# Bingsu Backend

Backend services for Bingsu application - FastAPI, PostgreSQL, Qdrant, Redis, and supporting services.

## 📁 โครงสร้าง

```
Backend/
├── Database/           # Database services
│   ├── Management/     # Docker orchestration (PostgreSQL + Qdrant + Redis)
│   ├── PostgreSQL/     # Relational database (Prisma schema)
│   ├── Qdrant/         # Vector database service
│   └── Redis/          # Cache & queue service
│
└── Service/            # Application services
    ├── Embedded/       # Embeddings service (OpenAI, Gemini)
    ├── Rag/            # RAG (Retrieval-Augmented Generation) service
    ├── Redis/          # Redis client service
    ├── nginx/          # Nginx reverse proxy config
    └── Website/        # FastAPI main application
```

## Quick Start

### 1. Setup Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Or for local development (recommended)
cp .env.example .env.local

# Edit .env with your configuration
nano .env
```

**See [.env.example](.env.example) for all available environment variables.**

### 2. Start Databases

```bash
# Start all databases (PostgreSQL, Qdrant, Redis)
cd Database/Management
docker compose up -d

# Or start individually:
cd Database/PostgreSQL && docker compose up -d
cd Database/Qdrant && docker compose up -d
cd Database/Redis && docker compose up -d
```

### 3. Setup PostgreSQL Schema

```bash
cd Database/PostgreSQL

# Install Prisma CLI (if not installed)
npm install

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev
```

### 4. Install Service Dependencies

```bash
# Embeddings service
cd Service/Embedded && npm install

# RAG service
cd Service/Rag && npm install

# Redis service
cd Service/Redis && npm install

# Website (FastAPI)
cd Service/Website && pip install -r requirements.txt
```

### 5. Start FastAPI Server

```bash
cd Service/Website
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 📚 Services Documentation

### Database Services

- **PostgreSQL**: [Database/PostgreSQL/README.md](Database/PostgreSQL/README.md)
- **Qdrant**: [Database/Qdrant/README.md](Database/Qdrant/README.md)
- **Redis**: [Database/Redis/README.md](Database/Redis/README.md)
- **Management**: [Database/Management/README.md](Database/Management/README.md)

### Application Services

- **Website (FastAPI)**: [Service/Website/README.md](Service/Website/README.md)
- **Embeddings**: [Service/Embedded/README.md](Service/Embedded/README.md)
- **RAG**: [Service/Rag/README.md](Service/Rag/README.md)
- **Redis Client**: [Service/Redis/README.md](Service/Redis/README.md)
- **Nginx**: [Service/nginx/README.md](Service/nginx/README.md)

## 🔧 Configuration

### Environment Variables

See [.env.example](.env.example) for all available environment variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `QDRANT_URL` - Qdrant vector database URL
- `REDIS_URL` - Redis connection string
- `EMBEDDING_PROVIDER` - "openai" or "gemini"
- `EMBEDDING_API_KEY` - API key for embeddings
- `JWT_SECRET_KEY` - Secret key for JWT tokens

## 🐳 Docker

### Start All Databases

```bash
cd Database/Management
docker compose up -d
```

### Stop All Databases

```bash
cd Database/Management
docker compose down
```

### View Logs

```bash
cd Database/Management
docker compose logs -f
```

## 🧪 Testing

### Test Qdrant

```bash
cd Database/Qdrant
npm test
```

### Test FastAPI

```bash
cd Service/Website
pytest  # If tests are available
```

## 📝 API Documentation

Once the FastAPI server is running:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## 🔐 Security

- Change `JWT_SECRET_KEY` in production
- Use strong passwords for database
- Enable SSL/TLS in production
- Configure CORS properly
- Use environment variables for secrets

## 📦 Dependencies

### Node.js Services
- Embeddings: `@google/genai`, `undici`
- RAG: `dotenv`
- Redis: `redis`

### Python Services
- FastAPI: `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`
- Database: `psycopg2-binary`
- Auth: `python-jose`, `bcrypt`, `passlib`

## 🛠️ Development

### Prisma Commands

```bash
cd Database/PostgreSQL

# Generate Prisma Client
npx prisma generate

# Create migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Open Prisma Studio
npx prisma studio
```

## 📄 License

[Your License Here]
