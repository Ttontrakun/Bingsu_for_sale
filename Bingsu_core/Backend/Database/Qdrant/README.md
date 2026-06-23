# Enterprise AI Chatbot Qdrant Database

Qdrant service for storing and searching vectors.

## ⚠️ Docker Setup

**Note**: For Docker setup, use `Database/Management/docker-compose.yml` which orchestrates PostgreSQL, Qdrant, and Redis together.

If you need to run Qdrant separately, you can use the docker-compose.yml in this directory, but it's recommended to use Management for consistency.

## Setup

### 1. Start Qdrant with Docker

```bash
# Recommended: Use Management docker-compose
cd ../Management
docker compose up -d qdrant

# Or standalone (not recommended)
cd Database/Qdrant
docker compose up -d
```

### 2. Install dependencies:
```bash
cd ../../Service/Rag
npm install
```

### 3. Configure environment variables (in parent directory `.env`):
```env
QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY=""  # Optional, for cloud Qdrant
QDRANT_COLLECTION="documents"
QDRANT_DISTANCE="Cosine"
QDRANT_TOP_K="6"
```

## Usage

```javascript
import { searchQdrant, upsertPoints, deleteDocumentVectors, ensureCollection } from "./qdrant.js";

// Ensure collection exists
await ensureCollection(1536);  // vectorSize

// Upsert vectors
await upsertPoints([
  {
    id: "point-1",
    vector: [0.1, 0.2, 0.3, ...],
    payload: { docId: "doc1", text: "..." }
  }
]);

// Search vectors
const results = await searchQdrant(vector, { docIds: ["doc1"], limit: 6 });

// Delete document vectors
await deleteDocumentVectors("doc1");
```

## Features

- ✅ Qdrant collection management
- ✅ Vector upsert and search
- ✅ Delete vectors by document ID
- ✅ Batch processing support
- ✅ Error handling

## Testing

```bash
npm test
```

## Documentation

- Qdrant Dashboard: http://localhost:6333/dashboard
- Qdrant API Docs: https://qdrant.tech/documentation/
