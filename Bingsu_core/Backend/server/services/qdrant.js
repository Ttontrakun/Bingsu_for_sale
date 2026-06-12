import crypto from "crypto";
import {
  embeddingBatchSize,
  qdrantApiKey,
  qdrantCollectionName,
  qdrantDistance,
  qdrantTopK,
  qdrantUrl,
} from "../config.js";
import { embedTexts } from "./embeddings.js";
import { chunkTextForBlocks } from "./text.js";

const headers = () => {
  const base = { "Content-Type": "application/json" };
  if (qdrantApiKey) {
    return { ...base, "api-key": qdrantApiKey };
  }
  return base;
};

const qdrantFetch = async (path, options = {}) => {
  const url = `${qdrantUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Qdrant request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
};

let collectionReady = false;
let collectionSize = null;

export const ensureCollection = async (vectorSize) => {
  if (collectionReady && collectionSize === vectorSize) return;
  try {
    const existing = await qdrantFetch(`/collections/${qdrantCollectionName}`, { method: "GET" });
    const size = existing?.result?.config?.params?.vectors?.size;
    if (size && size !== vectorSize) {
      throw new Error(`Qdrant collection size mismatch (expected ${vectorSize}, got ${size})`);
    }
    collectionReady = true;
    collectionSize = size || vectorSize;
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("404")
      || message.includes("Not found")
      || message.includes("doesn't exist")
    ) {
      await qdrantFetch(`/collections/${qdrantCollectionName}`, {
        method: "PUT",
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: qdrantDistance,
          },
        }),
      });
      collectionReady = true;
      collectionSize = vectorSize;
      return;
    }
    throw error;
  }
};

export const upsertPoints = async (points) => {
  if (!points.length) return;
  await qdrantFetch(`/collections/${qdrantCollectionName}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({ points }),
  });
};

export const deleteDocumentVectors = async (documentId) => {
  if (!documentId) return;
  await qdrantFetch(`/collections/${qdrantCollectionName}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        must: [
          {
            key: "docId",
            match: { value: documentId },
          },
        ],
      },
    }),
  });
};

export const searchQdrant = async (vector, { docIds = [], limit } = {}) => {
  if (!vector || !vector.length) return [];
  const must = [];
  if (docIds.length) {
    must.push({
      key: "docId",
      match: { any: docIds },
    });
  }

  const response = await qdrantFetch(`/collections/${qdrantCollectionName}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector,
      limit: limit || qdrantTopK,
      with_payload: true,
      filter: must.length ? { must } : undefined,
    }),
  });

  return response?.result || [];
};

/** Scroll points by filter — ใช้หา point id จาก docId, chunkIndex, fileName (รองรับ offset สำหรับ paginate) */
export const scrollPoints = async (filter, { limit = 10, offset = null } = {}) => {
  const body = {
    filter: filter?.must?.length ? filter : undefined,
    limit,
    with_payload: true,
    with_vector: false,
  };
  if (offset !== undefined && offset !== null) body.offset = offset;
  const response = await qdrantFetch(`/collections/${qdrantCollectionName}/points/scroll`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    points: response?.result?.points ?? [],
    nextPageOffset: response?.result?.next_page_offset ?? null,
  };
};

/**
 * อัปเดตข้อความใน chunk ใน Qdrant (ใช้เมื่อผู้ใช้แก้คำในแชทแล้วต้องการให้ฐานความรู้ตรงกับที่แก้)
 * @param {{ docId: string, chunkIndex: number, fileName?: string, newText: string }} opts
 * @returns {Promise<{ updated: boolean }>}
 */
export const updateChunkText = async ({ docId, chunkIndex, fileName, newText }) => {
  if (!docId || newText == null || String(newText).trim() === "") {
    return { updated: false };
  }
  const must = [
    { key: "docId", match: { value: docId } },
    { key: "chunkIndex", match: { value: Number(chunkIndex) } },
  ];
  if (fileName != null && String(fileName).trim() !== "") {
    must.push({ key: "fileName", match: { value: String(fileName) } });
  }
  const { points } = await scrollPoints({ must }, { limit: 1 });
  if (!points.length) {
    return { updated: false };
  }
  const point = points[0];
  const pointId = point.id;
  const vectors = await embedTexts([String(newText).trim()]);
  if (!vectors?.length) {
    return { updated: false };
  }
  await upsertPoints([
    {
      id: pointId,
      vector: vectors[0],
      payload: {
        ...(point.payload || {}),
        text: String(newText).trim(),
      },
    },
  ]);
  return { updated: true };
};

/**
 * สแกนทุก point ในเอกสาร (docId) แล้วแทนที่ข้อความใน payload.text (fromStr → toStr) และอัปเดต vector ใน Qdrant
 * ใช้เมื่อแก้คำในแชทแล้วต้องการให้ฐานความรู้ทั้งเอกสารตรงกับที่แก้
 * @param {{ docId: string, fromStr: string, toStr: string }} opts
 * @returns {Promise<number>} จำนวน chunk ที่อัปเดต
 */
/** ปกติข้อความสำหรับเปรียบเทียบ (ยุบช่องว่างเป็น space เดียว) */
const normalizeTextForMatch = (s) => String(s || "").replace(/\s+/g, " ").trim();

export const replaceTextInDocument = async ({ docId, fromStr, toStr }) => {
  if (!docId || !fromStr || typeof toStr !== "string") return 0;
  const from = String(fromStr).trim();
  if (!from) return 0;
  const to = String(toStr);
  const fromNorm = normalizeTextForMatch(from);
  let totalUpdated = 0;
  let offset = null;
  const limit = 100;
  const toUpdate = [];

  do {
    const filter = { must: [{ key: "docId", match: { value: String(docId) } }] };
    const { points, nextPageOffset } = await scrollPoints(filter, { limit, offset });
    for (const point of points) {
      const text = point?.payload?.text;
      if (typeof text !== "string") continue;
      const hasLiteral = text.includes(from);
      const textNorm = normalizeTextForMatch(text);
      const hasNorm = fromNorm && textNorm.includes(fromNorm);
      if (!hasLiteral && !hasNorm) continue;
      let newText;
      if (hasLiteral) {
        newText = text.split(from).join(to);
      } else {
        const re = new RegExp(fromNorm.split(/\s+/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "gi");
        newText = text.replace(re, to);
      }
      toUpdate.push({ point, newText });
    }
    offset = nextPageOffset;
  } while (offset != null);

  if (!toUpdate.length) return 0;
  const texts = toUpdate.map((u) => u.newText);
  let vectors;
  try {
    vectors = await embedTexts(texts);
  } catch (err) {
    console.warn("[replaceTextInDocument] embedTexts failed:", err);
    return 0;
  }
  if (!vectors || vectors.length !== toUpdate.length) return 0;

  const batchSize = 50;
  for (let i = 0; i < toUpdate.length; i += batchSize) {
    const batch = toUpdate.slice(i, i + batchSize);
    const vecBatch = vectors.slice(i, i + batchSize);
    const pointsToUpsert = batch.map(({ point }, j) => ({
      id: point.id,
      vector: vecBatch[j],
      payload: { ...(point.payload || {}), text: batch[j].newText },
    }));
    await upsertPoints(pointsToUpsert);
    totalUpdated += batch.length;
  }
  return totalUpdated;
};

/** ใช้ config เพื่อลดจำนวน round-trip ไป embedding API (batch ใหญ่ = เรียกน้อยครั้ง) */
const EMBED_BATCH_SIZE = embeddingBatchSize;

/** รัน embedding หลาย batch พร้อมกัน (ลดเวลารอเมื่อ chunk เยอะ) */
const EMBED_PARALLEL_BATCHES = 2;

export const indexDocumentChunks = async ({ documentId, userId, sourceFiles, onProgress }) => {
  const chunks = [];
  (sourceFiles || []).forEach((file, fileIndex) => {
    const blocks = Array.isArray(file?.blocks) ? file.blocks : [];
    let fileChunkIndex = 0;
    blocks.forEach((block, index) => {
      const text = block?.text?.trim();
      if (!text) return;
      const splitTexts = chunkTextForBlocks(text);
      splitTexts.forEach((piece, pieceIndex) => {
        const partLabel =
          splitTexts.length > 1
            ? `${block?.label || `Chunk ${index + 1}`} • Part ${pieceIndex + 1}/${splitTexts.length}`
            : (block?.label || `Chunk ${index + 1}`);
        chunks.push({
          text: piece,
          payload: {
            docId: documentId,
            userId,
            fileName: file?.name || `file-${fileIndex + 1}`,
            label: partLabel,
            chunkIndex: fileChunkIndex,
          },
        });
        fileChunkIndex += 1;
      });
    });
  });

  if (!chunks.length) return;
  const vectors = [];
  const totalBatches = Math.ceil(chunks.length / EMBED_BATCH_SIZE);
  const embedStart = Date.now();
  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE * EMBED_PARALLEL_BATCHES) {
      const promises = [];
      const ranges = [];
      for (let p = 0; p < EMBED_PARALLEL_BATCHES; p++) {
        const start = i + p * EMBED_BATCH_SIZE;
        const end = Math.min(start + EMBED_BATCH_SIZE, chunks.length);
        if (start >= chunks.length) break;
        const batch = chunks.slice(start, end);
        promises.push(embedTexts(batch.map((c) => c.text)));
        ranges.push({ start, end, batchIndex: Math.floor(start / EMBED_BATCH_SIZE) + 1 });
      }
      const results = await Promise.all(promises);
      for (const v of results) vectors.push(...v);
      const lastBatchIndex = ranges[ranges.length - 1]?.batchIndex ?? Math.floor(i / EMBED_BATCH_SIZE) + 1;
      if (typeof onProgress === "function") {
        onProgress(Math.min(lastBatchIndex, totalBatches), totalBatches, chunks.length);
      }
    }
    const embedMs = Date.now() - embedStart;
    console.log(`[Qdrant] Embedding done: ${chunks.length} chunk(s) in ${(embedMs / 1000).toFixed(1)}s (ถ้าช้า ลองใช้โมเดล embed ที่เล็ก/เร็วกว่าใน .env)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Local/dev-friendly behavior: allow uploads to complete even if embeddings are not configured.
    // Chat will fall back to keyword-based matching over stored blocks when Qdrant has no vectors.
    if (message.includes("GEMINI_API_KEY") || message.includes("EMBEDDING_API_KEY")) {
      console.warn("Skipping Qdrant indexing because embeddings are not configured:", message);
      return;
    }
    // If the embedding provider is rate-limited / quota exceeded, don't fail the whole upload.
    // The app can still work with keyword-based fallback until quota resets.
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : null;
    if (status === 429 || message.includes("RESOURCE_EXHAUSTED") || message.includes("quota") || message.includes("429")) {
      console.warn("Skipping Qdrant indexing due to embedding quota/rate limit:", message);
      return;
    }
    throw error;
  }
  const vectorSize = vectors[0]?.length || 0;
  if (!vectorSize) {
    console.warn("Skipping Qdrant indexing because embedding returned empty vector");
    return;
  }
  await ensureCollection(vectorSize);

  const points = vectors.map((vector, index) => ({
    id: crypto.randomUUID(),
    vector,
    payload: {
      ...chunks[index].payload,
      text: chunks[index].text,
    },
  }));

  const batchSize = 128;
  for (let i = 0; i < points.length; i += batchSize) {
    await upsertPoints(points.slice(i, i + batchSize));
  }
};
