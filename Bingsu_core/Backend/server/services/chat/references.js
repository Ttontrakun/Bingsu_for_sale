/**
 * สร้างรายการอ้างอิง (เอกสาร/ตำแหน่งที่ใช้ตอบ) + เลขอ้างอิง [n] ในคำตอบ
 * ย้ายมาจาก routes/conversations.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม)
 */
import { hasSufficientGroundingEvidence, isOverviewStyleQuery } from "./queryClassifiers.js";

/** สร้างรายการอ้างอิง (เอกสารที่ใช้ตอบ) จาก groundingChunks + contextDocuments */
export function buildReferences(groundingChunks, contextDocuments, primaryDocument) {
  // ชุดนี้มี chunk ที่ผ่าน reranker แล้วหรือไม่ — ถ้ามี chunk ที่ "ไม่ผ่าน rerank" (เช่นมาจาก keyword merge)
  // จะถือว่าเกี่ยวข้องน้อย เพื่อไม่ให้เอกสารนอกเรื่อง (ที่ keyword ดึงมา) โผล่เป็นแหล่งอ้างอิง
  const anyReranked = (groundingChunks || []).some((c) => Number.isFinite(Number(c?.rerankScore)));
  const docMap = new Map((contextDocuments || []).map((d) => [d?.id, d?.displayName || d?.fileName || "เอกสาร"]));
  const refsByDoc = new Map();
  const normalizeQuote = (input) => {
    const raw = String(input || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    // Remove noisy spreadsheet-like prefixes: "Sheet X | Row Y | column_2: ..."
    const stripped = raw
      .replace(/^(?:sheet|tab)\s*[^|]*\|\s*/i, "")
      .replace(/^(?:row|line|column)\s*[_\d\s-]*:?\s*/i, "");
    return (stripped || raw).slice(0, 220).trim();
  };
  const buildLineHint = ({ label, chunkIndex, textRaw }) => {
    const rowMatch = label.match(/row\s+(\d+)/i) || textRaw.match(/\brow\s+(\d+)\b/i);
    const lineMatch = label.match(/line\s+(\d+)(?:\s*[-–]\s*(\d+))?/i) || textRaw.match(/\bline\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/i);
    const pageMatch = label.match(/page\s+(\d+)/i) || textRaw.match(/\bpage\s+(\d+)\b/i);
    if (rowMatch) return { lineHint: `แถว ${rowMatch[1]}`, page: null };
    if (lineMatch) return { lineHint: lineMatch[2] ? `บรรทัด ${lineMatch[1]}-${lineMatch[2]}` : `บรรทัด ${lineMatch[1]}`, page: null };
    if (pageMatch) return { lineHint: `หน้า ${pageMatch[1]}`, page: Number(pageMatch[1]) };
    if (chunkIndex !== null) return { lineHint: `ช่วงที่ ${chunkIndex + 1}`, page: null };
    return { lineHint: "", page: null };
  };
  const parsePosition = (chunk) => {
    const label = String(chunk?.payload?.label || "").trim();
    const rawChunkIndex = chunk?.payload?.chunkIndex;
    const chunkIndex = Number.isFinite(Number(rawChunkIndex)) ? Number(rawChunkIndex) : null;
    const textRaw = String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? "").trim();
    const { lineHint, page } = buildLineHint({ label, chunkIndex, textRaw });
    const quote = normalizeQuote(textRaw);
    // ใช้คะแนน rerank เป็นหลัก (แยก "เกี่ยว/ไม่เกี่ยว" ได้ขาดกว่า vector score)
    // ถ้าชุดนี้มี rerank แต่ chunk นี้ไม่มี (มาจาก keyword merge) → ให้คะแนน 0 = เกี่ยวน้อย จะได้ถูกกรองออก
    // ถ้าทั้งชุดไม่มี rerank เลย (rerank ปิด/ล้มเหลว) → fallback เป็น vector score ตามเดิม
    const rerank = Number(chunk?.rerankScore);
    let score;
    if (Number.isFinite(rerank)) score = rerank;
    else if (anyReranked) score = 0;
    else score = Number.isFinite(Number(chunk?.score)) ? Number(chunk.score) : 0;
    return { chunkIndex, label, lineHint, page, quote, score };
  };
  const refs = [];
  for (const chunk of groundingChunks || []) {
    const docId = chunk?.retrievedContext?.docId ?? chunk?.payload?.docId;
    const title = chunk?.retrievedContext?.title ?? chunk?.payload?.fileName;
    if (!docId) continue;

    if (!refsByDoc.has(docId)) {
      const next = {
        docId,
        displayName: docMap.get(docId) || title || "เอกสาร",
        positions: [],
        bestScore: Number.NEGATIVE_INFINITY,
      };
      refsByDoc.set(docId, next);
      refs.push(next);
    }
    const ref = refsByDoc.get(docId);
    const position = parsePosition(chunk);
    ref.bestScore = Math.max(ref.bestScore, position.score || 0);
    const positionKey = `${position.chunkIndex ?? "n"}::${position.label || ""}::${position.lineHint || ""}`;
    if (!ref.positions.some((item) => `${item.chunkIndex ?? "n"}::${item.label || ""}::${item.lineHint || ""}` === positionKey)) {
      ref.positions.push(position);
    }
    ref.positions.sort((a, b) => (b.score || 0) - (a.score || 0));
    if (ref.positions.length > 3) {
      ref.positions = ref.positions.slice(0, 3);
    }
  }
  /** Fallback เมื่อไม่มี chunk เฉพาะเอกสารหลักของแชท (Knowledge ที่เลือกตอนเปิดแชท) หรือถ้ามีอยู่ knowledge เดียว — ไม่รวมทุกไฟล์ในบอท */
  if (refs.length === 0) {
    const pushFallbackDoc = (doc) => {
      const docId = doc?.id;
      if (!docId || refsByDoc.has(docId)) return;
      const ref = {
        docId,
        displayName: docMap.get(docId) || doc?.displayName || doc?.fileName || "เอกสาร",
        positions: [],
        bestScore: Number.NEGATIVE_INFINITY,
      };
      refsByDoc.set(docId, ref);
      refs.push(ref);
    };
    if (primaryDocument?.id) pushFallbackDoc(primaryDocument);
    else if ((contextDocuments || []).length === 1) pushFallbackDoc(contextDocuments[0]);
  }
  // กันเอกสารที่เกี่ยวข้องน้อยหลุดมาเป็นแหล่งอ้างอิง (เช่น ถาม NT Corporate Internet แต่มี Dark Fiber ตามมา)
  // เก็บเฉพาะเอกสารที่คะแนนความเกี่ยวข้องใกล้เคียงอันดับ 1 (ตัดตัวที่คะแนนต่ำกว่ามาก)
  const finiteScores = refs.map((r) => r.bestScore).filter((s) => Number.isFinite(s) && s > 0);
  const topScore = finiteScores.length ? Math.max(...finiteScores) : 0;
  const minKeep = topScore * 0.75;
  const keptRefs = (topScore > 0 && refs.length > 1)
    ? refs.filter((r) => !Number.isFinite(r.bestScore) || r.bestScore >= minKeep)
    : refs;
  return keptRefs
    .sort((a, b) => (b.bestScore || Number.NEGATIVE_INFINITY) - (a.bestScore || Number.NEGATIVE_INFINITY))
    .map((ref) => ({ docId: ref.docId, displayName: ref.displayName, positions: ref.positions }));
}

export const PRIVATE_REFERENCE = { docId: "__private__", displayName: "เนื้อหาส่วนตัวของคุณ", positions: [] };

/**
 * การ์ดอ้างอิงสำหรับคำถามแนว "มีเอกสารอะไรบ้าง" — 1 ชิปต่อชุดความรู้
 * ไม่ผ่านการกรองด้วยคะแนน retrieval เพราะคำถามนี้ตั้งใจอ้างถึงทุกชุดที่บอทใช้ได้
 * (กดชิปแล้วในโมดัลจะเห็นไฟล์ต้นฉบับทุกไฟล์ของชุดนั้นให้เปิด/ดาวน์โหลด)
 */
export function buildDocumentListReferences(contextDocuments = []) {
  const refs = [];
  const seen = new Set();
  for (const doc of contextDocuments || []) {
    const docId = doc?.id;
    if (!docId || seen.has(docId)) continue;
    seen.add(docId);
    refs.push({
      docId,
      displayName: doc?.displayName || doc?.fileName || "เอกสาร",
      positions: [],
    });
  }
  return refs;
}

/** จำนวนแหล่งอ้างอิงสูงสุดต่อคำตอบ — กันแถบชิปยาวเกิน */
export const MAX_CITATION_SOURCES = 8;

/**
 * รายการอ้างอิงสำหรับแสดงใต้คำตอบ — 1 ชิปต่อเอกสาร (ไม่แตกตามตำแหน่ง/เลข [n])
 */
export function flattenReferencesForCitations(refs) {
  const out = [];
  for (const ref of refs || []) {
    if (out.length >= MAX_CITATION_SOURCES) break;
    if (!ref?.docId) continue;
    out.push({
      docId: ref.docId,
      displayName: ref.displayName || "เอกสาร",
      positions: Array.isArray(ref.positions) ? ref.positions.slice(0, 3) : [],
    });
  }
  return out;
}

/**
 * system message บอกแหล่งที่ใช้ตอบ — ไม่ให้โมเดลแปะเลข [n] ในเนื้อความ
 * (UI แสดงการ์ดแหล่งอ้างอิงด้านล่างแยกต่างหาก)
 */
export function buildCitationSystemMessage(flatRefs) {
  if (!Array.isArray(flatRefs) || flatRefs.length === 0) return null;
  const lines = flatRefs.map((ref) => {
    const pos = Array.isArray(ref.positions) ? ref.positions[0] : null;
    const where = pos?.lineHint || (Number.isFinite(pos?.page) ? `หน้า ${pos.page}` : "");
    const privateTag = String(ref.docId) === "__private__" ? " [PRIVATE]" : "";
    return `- ${ref.displayName}${where ? ` (${where})` : ""}${privateTag}`;
  });
  const hasPrivate = flatRefs.some((ref) => String(ref.docId) === "__private__");
  const privateRule = hasPrivate
    ? (
      "\nกติกาข้อมูลส่วนตัว (สำคัญ): ช่วงข้อความใดที่สรุปหรืออ้างจากข้อมูลส่วนตัวของผู้ใช้ " +
      "ต้องห่อด้วย ==...== เช่น ==ผู้อนุมัติตามที่คุณกำหนด== " +
      "ไม่ต้องคัดลอกข้อความใน /จำ ตรงตัว — ถ้อยคำต่างกันได้ถ้าความหมายมาจากข้อมูลส่วนตัว " +
      "ห้ามห่อข้อความจากเอกสารระบบด้วย ==...=="
    )
    : "";
  return {
    role: "system",
    content:
      `แหล่งข้อมูลที่ใช้ตอบรอบนี้ (ระบบจะแสดงการ์ดอ้างอิงด้านล่างคำตอบให้ผู้ใช้เอง):\n${lines.join("\n")}\n\n` +
      "กติกา: ห้ามใส่เลขอ้างอิง [1]/[2]/【1】 หรือรายการ Sources/ที่มา จากเอกสารในเนื้อคำตอบ " +
      "ห้ามพิมพ์ชื่อไฟล์หรือฟุตโน้ตท้ายคำตอบ — ตอบเนื้อหาอย่างเดียว" +
      privateRule,
  };
}

/**
 * ตัดเลขอ้างอิงแบบ inline ออกจากคำตอบทั้งหมด ([n] / 【n】)
 * ไม่แตะ markdown link อย่าง [ข้อความ](url)
 */
export function stripInvalidCitationMarkers(text, _maxIndex) {
  return String(text || "")
    .replace(/【\d{1,2}】/g, "")
    .replace(/\[(\d{1,2})\](?!\()/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ?\n{3,}/g, "\n\n")
    .trim();
}

/**
 * อ้างอิงสำหรับการตอบจริง: ในโหมดส่วนตัวให้เพิ่ม "เนื้อหาส่วนตัวของคุณ" ไว้บนสุด
 * และถ้าไม่มีหลักฐานจริงจากเอกสารระบบ จะไม่อ้างอิงเอกสารระบบแบบเดา (กันอ้างอิงผิด)
 */
export function buildReferencesForReply({ groundingChunks, contextDocuments, primaryDocument, message, hasPrivateContext }) {
  const hasRealEvidence =
    Array.isArray(groundingChunks) &&
    groundingChunks.length > 0 &&
    hasSufficientGroundingEvidence(message, groundingChunks);

  if (!hasPrivateContext) {
    // โหมดปกติ: ถ้าไม่มีหลักฐานจริง และไม่ใช่คำถามแนวสรุป/ภาพรวม
    // → ไม่แปะการ์ดอ้างอิงเอกสารที่ไม่ตรงคำถาม (กันเคสตอบทักทาย/คำถามทั่วไป/วันที่
    //   แล้วมี Dark Fiber/Tower ติดมาตาม top-k). ยกเว้นคำถามแนวสรุปที่ตั้งใจอ้างเอกสารทั้งฉบับ
    if (!hasRealEvidence && !isOverviewStyleQuery(message)) {
      return [];
    }
    return buildReferences(groundingChunks, contextDocuments, primaryDocument);
  }

  // โหมดส่วนตัว: ถ้าไม่มีหลักฐานจริงจากเอกสารระบบ → เหลือแค่ "เนื้อหาส่วนตัวของคุณ" เพื่อกันอ้างอิงมั่ว
  if (!hasRealEvidence) {
    return [PRIVATE_REFERENCE];
  }
  const refs = buildReferences(groundingChunks, contextDocuments, primaryDocument);
  return [PRIVATE_REFERENCE, ...refs];
}
