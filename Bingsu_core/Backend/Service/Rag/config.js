import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

// Qdrant Configuration
export const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
export const qdrantApiKey = process.env.QDRANT_API_KEY || "";
export const qdrantCollectionName = process.env.QDRANT_COLLECTION || "documents";
export const qdrantDistance = process.env.QDRANT_DISTANCE || "Cosine";
export const qdrantTopK = Number(process.env.QDRANT_TOP_K || 6);

// RAG Configuration
export const RAG_TIMEOUT_MS = Number(process.env.RAG_TIMEOUT_MS || 2000);
// RAG Query Synonyms
const parseJsonEnv = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const defaultRagSynonyms = {
  "ความสามารถ": ["skill", "ability", "competency"],
  "ทักษะ": ["skill", "ability", "competency"],
  "skill": ["ความสามารถ", "ทักษะ", "ability", "competency"],
  "ability": ["ความสามารถ", "ทักษะ", "skill", "competency"],
  "competency": ["ความสามารถ", "ทักษะ", "skill", "ability"],
};

const envRagSynonyms = parseJsonEnv(process.env.RAG_QUERY_SYNONYMS);
export const ragQuerySynonyms = envRagSynonyms && typeof envRagSynonyms === "object"
  ? { ...defaultRagSynonyms, ...envRagSynonyms }
  : defaultRagSynonyms;

export const ragQueryVariantLimit = Number(process.env.RAG_QUERY_VARIANT_LIMIT || 4);
