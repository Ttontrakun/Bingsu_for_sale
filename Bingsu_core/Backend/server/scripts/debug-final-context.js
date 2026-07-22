// จำลอง "context สุดท้ายที่ส่งให้ LLM" ของคำถามรวมหลายข้อ — เพื่อดูว่า chunk ที่มีคำตอบ (เช่น รบ.7/2569)
// ยังอยู่ไหมหลังผ่าน retrieval → merge → buildContextPieces → ตัดตัวอักษร
//
//   docker compose exec -e Q="1. ... 2. ... 3. ..." -e FIND="รบ.7/2569|เสาโทรคมนาคม" legacy node server/scripts/debug-final-context.js

import { prisma } from "../db.js";
import { retrieveGroundingChunks } from "../services/rag.js";
import {
  buildContextPiecesWithNeighbors,
  buildFallbackGroundingChunksFromDocuments,
  mergeHybridChunks,
} from "../services/text.js";

const MAX_CONTEXT_PIECES = Number(process.env.MAX_CONTEXT_PIECES || 12);
const CONTEXT_NEIGHBOR_WINDOW = Number(process.env.CONTEXT_NEIGHBOR_WINDOW || 0);
const MAX_CONTEXT_CHARS_FOR_MODEL = Number(process.env.MAX_CONTEXT_CHARS_FOR_MODEL || 12000);

const query = process.env.Q || "1. PM เสาคือใคร 2. บริการเสาโทรคมนาคมอ้างอิงคำสั่งเลขที่อะไร 3. Corporate Internet ให้ส่วนลดเกิน Floor Price ใครอนุมัติ";
const findRe = new RegExp(process.env.FIND || "รบ\\.?\\s?7/2569|เสาโทรคมนาคม", "i");

const hasMultipleQuestions = (m) => {
  const s = String(m || "");
  if ((s.match(/[?？]/g) || []).length >= 2) return true;
  if ((s.match(/(?:^|\s)\d{1,2}[.)]+\s+\S/g) || []).length >= 2) return true;
  return false;
};

const main = async () => {
  // ใช้ทุกเอกสารในระบบเป็นขอบเขต (จำลองว่าแชทเลือก Knowledge ที่มีทุกไฟล์)
  const docs = await prisma.document.findMany({ select: { id: true, displayName: true, sourceFiles: true } });
  const docIds = docs.map((d) => d.id);
  console.log(`เอกสารในขอบเขต: ${docIds.length} ชุด | คำถาม: "${query}"\n`);

  let groundingChunks = await retrieveGroundingChunks(docIds, query, { fast: false });
  console.log(`retrieval คืน chunk: ${groundingChunks.length} ชิ้น`);
  const gcHasAnswer = groundingChunks.some((c) => findRe.test(String(c?.retrievedContext?.text ?? c?.payload?.text ?? "")));
  console.log(`  → มี chunk ที่ตรง "${findRe}" ไหม: ${gcHasAnswer ? "✅ มี" : "❌ ไม่มี"}`);

  const keywordChunks = buildFallbackGroundingChunksFromDocuments(query, docs, 4);
  if (keywordChunks.length > 0) {
    groundingChunks = mergeHybridChunks(groundingChunks, keywordChunks, Math.max(MAX_CONTEXT_PIECES, groundingChunks.length));
  }

  const maxPieces = hasMultipleQuestions(query) ? Math.min(MAX_CONTEXT_PIECES * 2, 28) : MAX_CONTEXT_PIECES;
  const pieces = buildContextPiecesWithNeighbors(groundingChunks, docs, query, { maxPieces, neighborWindow: CONTEXT_NEIGHBOR_WINDOW });
  console.log(`\nbuildContextPieces: maxPieces=${maxPieces} → ได้ ${pieces.length} ชิ้น`);
  const pieceWithAnswer = pieces.findIndex((p) => findRe.test(p));
  console.log(`  → ชิ้นที่มีคำตอบอยู่ตำแหน่ง: ${pieceWithAnswer >= 0 ? "#" + (pieceWithAnswer + 1) : "❌ ไม่มีเลย"}`);

  let contextText = pieces.join("\n\n---\n\n");
  const beforeLen = contextText.length;
  const truncated = contextText.length > MAX_CONTEXT_CHARS_FOR_MODEL;
  if (truncated) contextText = contextText.slice(0, MAX_CONTEXT_CHARS_FOR_MODEL);

  console.log(`\ncontext ก่อนตัด: ${beforeLen} ตัวอักษร | จำกัด: ${MAX_CONTEXT_CHARS_FOR_MODEL} | ตัดจริง: ${truncated ? "✅ ตัด" : "ไม่ตัด"}`);
  console.log(`\n====== ผลชี้ขาด ======`);
  console.log(`context สุดท้ายที่ LLM เห็น มี "${findRe}" ไหม: ${findRe.test(contextText) ? "✅ มี → ปัญหาอยู่ที่ LLM/prompt" : "❌ ไม่มี → chunk ถูกตัดทิ้งก่อนถึง LLM (ปัญหา pipeline)"}`);
};

main()
  .catch((e) => { console.error("ล้มเหลว:", e?.message || e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
