import { qdrantTopK, RAG_TIMEOUT_MS, ragQuerySynonyms, ragQueryVariantLimit, ragRerankEnabled, ragRerankRetrieveMultiplier, multiHopEnabled } from "../config.js";
import { embedTexts } from "./embeddings.js";
import { searchQdrant } from "./vectorDb.js";
import { rerankRetrievedChunks } from "./rerank.js";
import { prisma } from "../db.js";

// คำพ้องความหมายที่ผู้ดูแลจัดการผ่านหน้า Supportadmin (เก็บใน DB) — cache สั้นๆ กันยิง DB ทุกคำถาม
let dbSynonymCache = { data: {}, expiresAt: 0 };
const DB_SYNONYM_TTL_MS = 60 * 1000;
const getDbSynonyms = async () => {
  if (Date.now() < dbSynonymCache.expiresAt) return dbSynonymCache.data;
  try {
    const rows = await prisma.synonym.findMany({
      where: { enabled: true },
      select: { term: true, synonyms: true },
    });
    const dict = {};
    rows.forEach((r) => {
      if (r.term && Array.isArray(r.synonyms) && r.synonyms.length) dict[r.term] = r.synonyms;
    });
    dbSynonymCache = { data: dict, expiresAt: Date.now() + DB_SYNONYM_TTL_MS };
    return dict;
  } catch (err) {
    // ถ้าตาราง Synonym ยังไม่ถูก migrate หรือ DB ล่ม → ใช้ค่าที่ cache ไว้ล่าสุด (ไม่ให้ RAG พัง)
    return dbSynonymCache.data || {};
  }
};

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

/** แตกคำถามซับซ้อน (หลายเงื่อนไข/หลายส่วน) เป็นคำถามย่อย — คำถามง่ายที่ไม่มีตัวเชื่อม/? หลายอัน จะคืน [] (ไม่แตก) */
const decomposeIntoSubQuestions = (normalized) => {
  const parts = String(normalized || "")
    .split(/\s*(?:[?？]|และก็|แล้วก็|และ|กับ|อีกทั้ง|รวมถึง|พร้อมทั้ง)\s*/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
  return parts.length >= 2 ? Array.from(new Set(parts)) : [];
};

const expandQueryVariants = (query, { fast = false, extraSynonyms = {} } = {}) => {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (isOverviewStyleQuery(normalized)) {
    variants.add(OVERVIEW_QUERY_FALLBACK);
  }
  // โหมด Flash: ค้นแบบเบาเพื่อความเร็ว — ไม่แตกคำถามย่อย (multi-hop) และไม่ขยาย synonym
  // ลดจำนวน embedding + จำนวนครั้งที่ยิง Qdrant ให้เหลือน้อยที่สุด
  if (fast) {
    return Array.from(variants).slice(0, 2);
  }
  // Multi-hop (decomposition): คำถามซับซ้อน → เพิ่มคำถามย่อยเพื่อค้นให้ครบทุกส่วน (คำถามง่ายไม่ถูกแตก = ไม่ช้าลง)
  const subQuestions = multiHopEnabled ? decomposeIntoSubQuestions(normalized) : [];
  subQuestions.forEach((s) => variants.add(s));
  // แต่ละ entry = "กลุ่มคำที่มีความหมายเดียวกัน" (คำในเอกสาร + คำที่คนพิมพ์หลายแบบ)
  // ถ้าคำถามมีสมาชิกใดในกลุ่ม → เพิ่มสมาชิกที่เหลือทั้งหมดเป็นคำค้น (สองทิศทาง ไม่ต้องสนว่าใครเป็นคำในเอกสาร)
  const entries = Object.entries({ ...(ragQuerySynonyms || {}), ...(extraSynonyms || {}) });
  entries.forEach(([term, synonyms]) => {
    const group = [normalizeQuery(term), ...coerceSynonyms(synonyms).map(normalizeQuery)].filter(Boolean);
    if (group.length < 2) return;
    const present = group.filter((g) => normalized.includes(g));
    if (!present.length) return;
    group.forEach((member) => {
      variants.add(member);
      present.forEach((p) => {
        if (p !== member) variants.add(normalized.replaceAll(p, member));
      });
    });
  });
  const baseLimit = Number.isFinite(ragQueryVariantLimit) ? ragQueryVariantLimit : 5;
  // ถ้ามีคำถามย่อย ขยายเพดาน variant เพื่อไม่ให้คำถามย่อยถูกตัดออก
  const limit = subQuestions.length > 0 ? Math.min(8, baseLimit + subQuestions.length) : baseLimit;
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

/**
 * แยกข้อความออกเป็น "คำถามย่อย" เพื่อค้นแยกทีละข้อ
 * แก้ปัญหา: ถาม 2 คำถามพร้อมกันจากคนละเอกสาร แล้วข้อ 2 ตอบว่า "ไม่มีข้อมูล"
 * (เพราะเดิมค้นรวมครั้งเดียว chunk ของข้อ 2 หลุด top-k ไป)
 */
const splitSubQuestions = (query) => {
  const text = String(query || "").trim();
  if (!text) return [];
  // 1) แยกด้วยเครื่องหมายคำถาม / ขึ้นบรรทัดใหม่ ก่อน (ชัดเจนสุด)
  let parts = text.split(/[?？\n]+/).map((s) => s.trim()).filter(Boolean);
  // 2) ถ้ายังเป็นก้อนเดียว ลองแยกด้วยตัวเชื่อมที่มักคั่นหลายประเด็น
  if (parts.length < 2) {
    parts = text
      .split(/\s+(?:และก็|แล้วก็|อีกอย่าง|อีกข้อ|อีกคำถาม|รวมถึง|พร้อมทั้ง|และ|กับ)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // เก็บเฉพาะส่วนที่ยาวพอจะเป็นคำถามจริง (ตัดเศษสั้นๆ ที่ไม่ใช่ประเด็นทิ้ง)
  parts = parts.filter((p) => p.replace(/\s+/g, "").length >= 6);
  const unique = Array.from(new Set(parts));
  // ต้องได้ตั้งแต่ 2 ส่วนขึ้นไป (และไม่เกิน 4) ถึงถือว่าเป็นหลายคำถาม
  return unique.length >= 2 ? unique.slice(0, 4) : [];
};

const chunkKeyOf = (item) => {
  const p = item?.payload || {};
  return `${p.docId || "unknown"}::${p.chunkIndex ?? ""}::${String(p.text || item?.retrievedContext?.text || "").slice(0, 80)}`;
};

/** ค้น chunk สำหรับ "คำถามเดียว" — แกนหลักของ retrieval + rerank */
const retrieveForSingleQuery = async (docIds, query, { fast = false, extraSynonyms = {} } = {}) => {
  const variants = expandQueryVariants(query, { fast, extraSynonyms });
  if (!variants.length) return [];

  const cacheKey = buildCacheKey(docIds, variants);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // โหมด Flash: ข้าม external reranker (bge) และลดจำนวน candidate เพื่อความเร็ว
  const useRerank = ragRerankEnabled && !fast;
  const retrieveLimit = useRerank ? Math.min(50, qdrantTopK * ragRerankRetrieveMultiplier) : qdrantTopK;

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
    return Array.from(merged.values())
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
  })(), RAG_TIMEOUT_MS);

  let results = initialList.slice(0, qdrantTopK);
  if (useRerank && initialList.length > qdrantTopK) {
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
};

export const retrieveGroundingChunks = async (documentIds, query, { fast = false } = {}) => {
  const docIds = Array.from(new Set((documentIds || []).filter(Boolean))).sort();
  if (!docIds.length) return [];

  // โหมดปกติ (ไม่ fast): ดึงคำพ้องจาก DB มาช่วยขยายคำค้น เพื่อเชื่อมภาษาพูด ↔ คำทางการ
  const extraSynonyms = fast ? {} : await getDbSynonyms();

  try {
    const subQuestions = splitSubQuestions(query);

    // คำถามเดียว → ค้นตามปกติ
    if (subQuestions.length < 2) {
      return await retrieveForSingleQuery(docIds, query, { fast, extraSynonyms });
    }

    // หลายคำถาม (มักมาจากคนละเอกสาร) → ค้นแยกทีละข้อ โดยแต่ละข้อ rerank เทียบกับคำถามของตัวเอง
    // แล้วรวมแบบสลับกัน (round-robin) เพื่อรับประกันว่าทุกคำถามมี chunk ของตัวเองติดมาด้วย
    const perQuestionLists = await Promise.all(
      subQuestions.map((q) => retrieveForSingleQuery(docIds, q, { fast, extraSynonyms })),
    );

    const maxTotal = Math.min(qdrantTopK * 2, 18);
    const seen = new Set();
    const combined = [];
    const maxLen = Math.max(0, ...perQuestionLists.map((l) => l.length));
    for (let rank = 0; rank < maxLen && combined.length < maxTotal; rank += 1) {
      for (const list of perQuestionLists) {
        const item = list[rank];
        if (!item) continue;
        const key = chunkKeyOf(item);
        if (seen.has(key)) continue;
        seen.add(key);
        combined.push(item);
        if (combined.length >= maxTotal) break;
      }
    }
    return combined;
  } catch (error) {
    console.warn("Qdrant search failed, falling back to empty context", error);
    return [];
  }
};
