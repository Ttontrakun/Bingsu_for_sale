import { qdrantTopK, RAG_TIMEOUT_MS, ragQuerySynonyms, ragQueryVariantLimit, ragRerankEnabled, ragRerankRetrieveMultiplier } from "../config.js";
import { embedTexts } from "./embeddings.js";
import { searchQdrant } from "./vectorDb.js";
import { rerankRetrievedChunks } from "./rerank.js";

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

/** คำถามแบบภาพรวม/สรุป — ถ้าใช้คำเหล่านี้ มัก match เนื้อหาในเอกสารไม่ดี จึงเพิ่ม query fallback */
const OVERVIEW_QUERY_FALLBACK = "สรุปเนื้อหา เรื่องราวหลัก เกี่ยวกับ ประสบการณ์ การศึกษา งาน ชื่อ";

const isOverviewStyleQuery = (normalized) => {
  if (!normalized || normalized.length > 120) return false;
  const overviewPatterns = [
    /เอกสารเกี่ยวกับอะไร/,
    /เกี่ยวกับอะไร/,
    /สรุปให้/,
    /สรุป(ให้)?หน่อย/,
    /สรุปทั้งเอกสาร/,           // "ช่วยสรุปทั้งเอกสารให้หน่อย" — ให้ใช้ fallback query เพื่อดึง chunk
    /ทั้งเอกสาร.*สรุป|สรุป.*ทั้งเอกสาร/,
    /มีอะไรบ้าง/,
    /เรื่องอะไร/,
    /ชื่อใครบ้าง/,
    /มีชื่ออะไร/,
    /บอก(มา)?หน่อย/,
    /บอก(มา)?(ให้)?ฟัง/,
    /เนื้อหาโดยรวม/,
    /โดยรวมเป็นยังไง/,
  ];
  return overviewPatterns.some((re) => re.test(normalized));
};

const expandQueryVariants = (query) => {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (isOverviewStyleQuery(normalized)) {
    variants.add(OVERVIEW_QUERY_FALLBACK);
  }
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
  const limit = Number.isFinite(ragQueryVariantLimit) ? ragQueryVariantLimit : 5;
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

/** ล้าง RAG cache ที่เกี่ยวกับ docId นี้ (เรียกหลังอัปเดต chunk ใน Qdrant เพื่อให้รอบถัดไปดึง chunk ใหม่) */
export const invalidateRagCacheForDocument = (docId) => {
  if (!docId) return;
  const idStr = String(docId);
  const toDelete = [];
  for (const key of ragCache.keys()) {
    const docPart = key.split("::")[0] || "";
    if (docPart.split(",").includes(idStr)) toDelete.push(key);
  }
  toDelete.forEach((k) => ragCache.delete(k));
};

/** ล้าง RAG cache ทั้งหมด — ใช้หลังแก้คำในฐานความรู้ เพื่อให้ถามครั้งถัดไปได้ chunk ใหม่แน่นอน */
export const invalidateAllRagCache = () => {
  ragCache.clear();
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

/** คะแนนความเกี่ยวข้องจากคำในคำถามที่ปรากฏในข้อความ (ใช้สำหรับ rerank) */
const termOverlapScore = (query, text) => {
  const qTokens = normalizeQuery(query).split(/\s+/).filter((t) => t.length > 1);
  const normalized = normalizeQuery(text || "");
  if (!normalized || !qTokens.length) return 0;
  let hits = 0;
  qTokens.forEach((token) => {
    if (normalized.includes(token)) hits += 1;
  });
  return hits / qTokens.length;
};

export const retrieveGroundingChunks = async (documentIds, query) => {
  const docIds = Array.from(new Set((documentIds || []).filter(Boolean))).sort();
  if (!docIds.length) return [];

  const variants = expandQueryVariants(query);
  if (!variants.length) return [];

  const cacheKey = buildCacheKey(docIds, variants);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const retrieveLimit = ragRerankEnabled ? Math.min(50, qdrantTopK * ragRerankRetrieveMultiplier) : qdrantTopK;

  try {
    const initialList = await withTimeout((async () => {
      const vectors = await embedTexts(variants);
      const searchResults = await Promise.all(
        vectors.map((vector) => searchQdrant(vector, { docIds, limit: retrieveLimit })),
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
      let list = Array.from(merged.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, retrieveLimit)
        .map((result) => ({
          score: result.score,
          retrievedContext: {
            text: result.payload?.text,
            title: result.payload?.fileName,
            docId: result.payload?.docId,
          },
          payload: result.payload,
        }));

      return list;
    })(), RAG_TIMEOUT_MS);

    let results = initialList.slice(0, qdrantTopK);
    if (ragRerankEnabled && initialList.length > qdrantTopK) {
      try {
        const externalReranked = await rerankRetrievedChunks(query, initialList, qdrantTopK);
        if (Array.isArray(externalReranked) && externalReranked.length > 0) {
          results = externalReranked;
        } else {
          const termScore = (item) => termOverlapScore(query, item.retrievedContext?.text || item.payload?.text);
          results = initialList
            .map((item) => ({ item, rerank: 0.7 * (item.score || 0) + 0.3 * termScore(item) }))
            .sort((a, b) => b.rerank - a.rerank)
            .slice(0, qdrantTopK)
            .map(({ item }) => item);
        }
      } catch (rerankError) {
        console.warn("Rerank failed, using base retrieval results", rerankError);
      }
    }

    setCached(cacheKey, results);
    return results;
  } catch (error) {
    console.warn("Qdrant search failed, falling back to empty context", error);
    return [];
  }
};
