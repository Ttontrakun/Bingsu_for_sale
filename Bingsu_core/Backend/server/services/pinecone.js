/**
 * Pinecone vector DB — ใช้เมื่อ VECTOR_DB=pinecone
 * API ให้ผลลัพธ์รูปแบบเดียวกับ qdrant.js (searchQdrant, upsertPoints, deleteDocumentVectors, indexDocumentChunks)
 */
import crypto from "crypto";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  pineconeApiKey,
  pineconeIndexName,
  qdrantTopK,
} from "../config.js";
import { embedTexts } from "./embeddings.js";
import { chunkTextForBlocks } from "./text.js";

let pineconeClient = null;
let indexInstance = null;

const getIndex = async () => {
  if (!pineconeApiKey) throw new Error("Missing PINECONE_API_KEY");
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
  }
  if (!indexInstance) {
    indexInstance = pineconeClient.index(pineconeIndexName);
  }
  return indexInstance;
};

/** ไม่สร้าง index อัตโนมัติ — ต้องสร้างใน Pinecone Console ให้ dimension ตรงกับ embedding model (เช่น 768, 1536) */
export const ensureCollection = async (_vectorSize) => {
  await getIndex();
};

/** points = [{ id, vector, payload: { docId, userId, fileName, label, chunkIndex, text } }] */
export const upsertPoints = async (points) => {
  if (!points.length) return;
  const index = await getIndex();
  const records = points.map((p) => ({
    id: p.id || crypto.randomUUID(),
    values: p.vector,
    metadata: {
      docId: String(p.payload?.docId ?? ""),
      userId: String(p.payload?.userId ?? ""),
      fileName: String(p.payload?.fileName ?? ""),
      label: String(p.payload?.label ?? ""),
      chunkIndex: Number(p.payload?.chunkIndex ?? 0),
      text: String(p.payload?.text ?? ""),
    },
  }));
  await index.upsert({ records });
};

export const deleteDocumentVectors = async (documentId) => {
  if (!documentId) return;
  const index = await getIndex();
  await index.deleteMany({ filter: { docId: { $eq: documentId } } });
};

/**
 * คืนรูปแบบเดียวกับ searchQdrant: array of { id, score, payload: { docId, text, ... } }
 */
export const searchQdrant = async (vector, { docIds = [], limit } = {}) => {
  if (!vector || !vector.length) return [];
  const index = await getIndex();
  const topK = limit || qdrantTopK;
  const filter = docIds.length
    ? { docId: { $in: docIds.map(String) } }
    : undefined;
  const response = await index.query({
    vector,
    topK,
    includeMetadata: true,
    filter,
  });
  const matches = response.matches || [];
  return matches.map((m) => ({
    id: m.id,
    score: m.score ?? 0,
    payload: {
      ...(m.metadata || {}),
      text: m.metadata?.text ?? "",
    },
  }));
};

const EMBED_BATCH_SIZE = 50;

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
  let vectors = [];
  const totalBatches = Math.ceil(chunks.length / EMBED_BATCH_SIZE);
  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const batchVectors = await embedTexts(batch.map((c) => c.text));
      vectors.push(...batchVectors);
      const batchIndex = Math.floor(i / EMBED_BATCH_SIZE) + 1;
      if (typeof onProgress === "function") {
        onProgress(batchIndex, totalBatches, chunks.length);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("GEMINI_API_KEY") || message.includes("EMBEDDING_API_KEY")) {
      console.warn("Skipping Pinecone indexing because embeddings are not configured:", message);
      return;
    }
    if (message.includes("429") || message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
      console.warn("Skipping Pinecone indexing due to embedding quota/rate limit:", message);
      return;
    }
    throw error;
  }
  const vectorSize = vectors[0]?.length || 0;
  if (!vectorSize) {
    console.warn("Skipping Pinecone indexing because embedding returned empty vector");
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

  const batchSize = 100;
  for (let i = 0; i < points.length; i += batchSize) {
    await upsertPoints(points.slice(i, i + batchSize));
  }
};

/**
 * อัปเดตข้อความใน chunk (Pinecone: query by filter แล้ว overwrite ด้วย upsert)
 */
export const updateChunkText = async ({ docId, chunkIndex, fileName, newText }) => {
  if (!docId || newText == null || String(newText).trim() === "") {
    return { updated: false };
  }
  const index = await getIndex();
  const [vector] = await embedTexts([String(newText).trim()]);
  if (!vector?.length) return { updated: false };
  const filter = {
    docId: { $eq: String(docId) },
    chunkIndex: { $eq: Number(chunkIndex) },
  };
  if (fileName != null && String(fileName).trim() !== "") {
    filter.fileName = { $eq: String(fileName) };
  }
  const res = await index.query({
    vector,
    topK: 1,
    filter,
    includeMetadata: true,
  });
  const match = res.matches?.[0];
  if (!match?.id) return { updated: false };
  const metadata = {
    ...(match.metadata && typeof match.metadata === "object"
      ? Object.fromEntries(Object.entries(match.metadata).filter(([k]) => k !== "text"))
      : {}),
    docId: String(docId),
    chunkIndex: Number(chunkIndex),
    fileName: String(fileName ?? ""),
    text: String(newText).trim(),
  };
  await index.upsert({
    records: [{ id: match.id, values: vector, metadata }],
  });
  return { updated: true };
};

/** แทนที่ข้อความในทุก chunk ของเอกสาร (Pinecone: ยังไม่ implement — คืน 0) */
export const replaceTextInDocument = async () => 0;
