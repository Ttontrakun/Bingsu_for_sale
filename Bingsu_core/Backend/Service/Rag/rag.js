import { qdrantTopK, RAG_TIMEOUT_MS, ragQuerySynonyms, ragQueryVariantLimit } from "./config.js";
import { embedTexts } from "../Embedded/embeddings.js";
import { searchQdrant } from "../../Database/Qdrant/qdrant.js";

const RAG_CACHE_TTL_MS = 5 * 60 * 1000;
const RAG_CACHE_MAX_ENTRIES = 200;
const ragCache = new Map();

const normalizeQuery = (query) => String(query || "").trim().toLowerCase();

const buildCacheKey = (docIds, queries) =>
  `${docIds.join(",")}::${queries.join("||")}`;

const coerceSynonyms = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
};

const expandQueryVariants = (query) => {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  const entries = Object.entries(ragQuerySynonyms || {});
  entries.forEach(([term, synonyms]) => {
    const normalizedTerm = normalizeQuery(term);
    if (!normalizedTerm || !normalized.includes(normalizedTerm)) return;
    coerceSynonyms(synonyms).forEach((synonym) => {
      const normalizedSynonym = normalizeQuery(synonym);
      if (!normalizedSynonym) return;
      variants.add(normalized.replaceAll(normalizedTerm, normalizedSynonym));
      variants.add(normalizedSynonym);
    });
  });
  const limit = Number.isFinite(ragQueryVariantLimit) ? ragQueryVariantLimit : 4;
  return Array.from(variants).slice(0, Math.max(1, limit));
};

const getCached = (key) => {
  const entry = ragCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    ragCache.delete(key);
    return null;
  }
  ragCache.delete(key);
  ragCache.set(key, entry);
  return entry.value;
};

const setCached = (key, value) => {
  if (ragCache.size >= RAG_CACHE_MAX_ENTRIES) {
    const oldestKey = ragCache.keys().next().value;
    if (oldestKey) ragCache.delete(oldestKey);
  }
  ragCache.set(key, {
    value,
    expiresAt: Date.now() + RAG_CACHE_TTL_MS,
  });
};

const withTimeout = async (promise, ms) => {
  const timeoutMs = Number.isFinite(ms) ? ms : 0;
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("RAG request timed out.")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

export const retrieveGroundingChunks = async (documentIds, query) => {
  const docIds = Array.from(new Set((documentIds || []).filter(Boolean))).sort();
  if (!docIds.length) return [];

  const variants = expandQueryVariants(query);
  if (!variants.length) return [];

  const cacheKey = buildCacheKey(docIds, variants);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const results = await withTimeout((async () => {
      const vectors = await embedTexts(variants);
      const searchResults = await Promise.all(
        vectors.map((vector) => searchQdrant(vector, { docIds, limit: qdrantTopK })),
      );
      const merged = new Map();
      searchResults.flat().forEach((result) => {
        const payload = result?.payload || {};
        const key = `${payload.docId || "unknown"}::${payload.chunkIndex ?? ""}::${String(payload.text || "").slice(0, 80)}`;
        const existing = merged.get(key);
        if (!existing || result.score > existing.score) {
          merged.set(key, result);
        }
      });
      return Array.from(merged.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, qdrantTopK)
        .map((result) => ({
          score: result.score,
          retrievedContext: {
            text: result.payload?.text,
            title: result.payload?.fileName,
            docId: result.payload?.docId,
          },
          payload: result.payload,
        }));
    })(), RAG_TIMEOUT_MS);
    setCached(cacheKey, results);
    return results;
  } catch (error) {
    console.warn("Qdrant search failed, falling back to empty context", error);
    return [];
  }
};
