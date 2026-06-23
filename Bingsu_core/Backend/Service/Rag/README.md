# Enterprise AI Chatbot RAG Service

RAG (Retrieval-Augmented Generation) service สำหรับค้นหาและดึงข้อมูลจาก vector database

## โครงสร้าง

```
Service/
├── Embedded/       # Embeddings service
│   ├── config.js
│   ├── embeddings.js
│   └── package.json
└── Rag/            # RAG service (ที่นี่)
    ├── config.js   # Configuration (Qdrant, RAG)
    ├── rag.js      # RAG service (retrieveGroundingChunks)
    └── package.json
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in parent directory:

```env
# Qdrant
QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY=""  # Optional
QDRANT_COLLECTION="documents"
QDRANT_DISTANCE="Cosine"
QDRANT_TOP_K="6"

# Embeddings
EMBEDDING_PROVIDER="openai"  # or "gemini"
EMBEDDING_API_KEY="your-api-key"
EMBEDDING_MODEL="text-embedding-3-small"  # or "models/gemini-embedding-001"
EMBEDDING_BASE_URL="https://api.openai.com/v1"
EMBEDDING_BATCH_SIZE="32"
EMBEDDING_TIMEOUT_MS="10000"

# RAG
RAG_TIMEOUT_MS="2000"
RAG_QUERY_VARIANT_LIMIT="4"
RAG_QUERY_SYNONYMS='{"ความสามารถ":["skill","ability"],"ทักษะ":["skill"]}'
```

## Usage

### RAG Service

```javascript
import { retrieveGroundingChunks } from "./rag.js";

// Retrieve relevant chunks from documents
const chunks = await retrieveGroundingChunks(
  ["doc-1", "doc-2"],  // document IDs
  "What is artificial intelligence?"  // query
);

// Returns array of chunks with:
// - score: similarity score
// - retrievedContext: { text, title, docId }
// - payload: full payload from Qdrant
```

### Embeddings Service

Embeddings service อยู่ที่ `../Embedded/`:

```javascript
import { embedTexts } from "../Embedded/embeddings.js";

// Generate embeddings for texts
const vectors = await embedTexts([
  "This is a test document",
  "Another document"
]);

// Returns array of vectors (arrays of numbers)
```

## Features

- ✅ Query expansion with synonyms
- ✅ Multi-query variant search
- ✅ Result caching (5 minutes TTL)
- ✅ Timeout handling
- ✅ Error handling and fallbacks

## Dependencies

- `dotenv` - For environment variables

**Note:** Embeddings service อยู่ที่ `../Embedded/` แยกออกมาแล้ว
