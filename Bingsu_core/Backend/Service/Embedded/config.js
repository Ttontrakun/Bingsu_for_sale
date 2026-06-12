import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

// Embeddings Configuration
// Embeddings: openai or gemini
export const embeddingProvider = (process.env.EMBEDDING_PROVIDER || "openai").trim().toLowerCase();
export const embeddingBaseUrl = (process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
export const embeddingApiKey = process.env.EMBEDDING_API_KEY || "";
export const embeddingModel = process.env.EMBEDDING_MODEL
  || (embeddingProvider === "gemini" ? "models/gemini-embedding-001" : "text-embedding-3-small");
export const embeddingBatchSize = Number(process.env.EMBEDDING_BATCH_SIZE || 32);
export const embeddingTimeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS || 10000);
