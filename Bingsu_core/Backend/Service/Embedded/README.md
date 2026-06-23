# Enterprise AI Chatbot Embeddings Service

Embedding service สำหรับสร้าง vectors จากข้อความ (รองรับ OpenAI และ Gemini)

## โครงสร้าง

```
Service/
├── Embedded/       # Embeddings service (ที่นี่)
│   ├── config.js
│   ├── embeddings.js
│   └── package.json
└── Rag/            # RAG service
    ├── config.js
    └── rag.js
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in parent directory:

```env
# Embeddings
EMBEDDING_PROVIDER="openai"  # or "gemini"
EMBEDDING_API_KEY="your-api-key"
EMBEDDING_MODEL="text-embedding-3-small"  # or "models/gemini-embedding-001"
EMBEDDING_BASE_URL="https://api.openai.com/v1"
EMBEDDING_BATCH_SIZE="32"
EMBEDDING_TIMEOUT_MS="10000"

# For Gemini
GEMINI_API_KEY="your-gemini-api-key"
```

## Usage

```javascript
import { embedTexts } from "./embeddings.js";

// Generate embeddings for texts
const vectors = await embedTexts([
  "This is a test document",
  "Another document"
]);

// Returns array of vectors (arrays of numbers)
// Example: [[0.1, 0.2, 0.3, ...], [0.4, 0.5, 0.6, ...]]
```

## Features

- ✅ Support for OpenAI embeddings
- ✅ Support for Gemini embeddings
- ✅ Batch processing
- ✅ Timeout handling
- ✅ Error handling

## Dependencies

- `@google/genai` - For Gemini embeddings
- `undici` - For HTTP requests with timeout
- `dotenv` - For environment variables
