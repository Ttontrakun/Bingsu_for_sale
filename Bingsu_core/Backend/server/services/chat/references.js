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

/** จำนวนเลขอ้างอิงสูงสุดต่อคำตอบ — กันแถบชิปยาวเกินและ prompt บวม */
export const MAX_CITATION_SOURCES = 8;

/**
 * แตก references (จัดกลุ่มต่อเอกสาร, มีได้หลายตำแหน่ง) เป็นรายการเรียงเลข 1 ชิป = 1 ตำแหน่ง
 * เพื่อให้เลข [n] ในเนื้อความชี้ตำแหน่ง (เอกสาร+หน้า) ได้ตรงตัว
 */
export function flattenReferencesForCitations(refs) {
  const out = [];
  for (const ref of refs || []) {
    if (out.length >= MAX_CITATION_SOURCES) break;
    if (String(ref?.docId) === "__private__") {
      out.push({ docId: ref.docId, displayName: ref.displayName, positions: [] });
      continue;
    }
    const positions = Array.isArray(ref?.positions) && ref.positions.length > 0 ? ref.positions : [null];
    for (const pos of positions) {
      if (out.length >= MAX_CITATION_SOURCES) break;
      out.push({ docId: ref.docId, displayName: ref.displayName, positions: pos ? [pos] : [] });
    }
  }
  return out;
}

/** system message บอกรายการแหล่งอ้างอิงพร้อมเลข ให้โมเดลแปะ [n] ท้ายประโยคที่ใช้ข้อมูลนั้น */
export function buildCitationSystemMessage(flatRefs) {
  if (!Array.isArray(flatRefs) || flatRefs.length === 0) return null;
  const lines = flatRefs.map((ref, i) => {
    const pos = Array.isArray(ref.positions) ? ref.positions[0] : null;
    const where = pos?.lineHint || (Number.isFinite(pos?.page) ? `หน้า ${pos.page}` : "");
    const quote = pos?.quote ? ` — "${String(pos.quote).slice(0, 140)}"` : "";
    return `[${i + 1}] ${ref.displayName}${where ? ` (${where})` : ""}${quote}`;
  });
  return {
    role: "system",
    content:
      `รายการแหล่งอ้างอิง (สำหรับใส่เลขกำกับในคำตอบ):\n${lines.join("\n")}\n\n` +
      "กติกาการอ้างอิง (ต้องทำเสมอ): ทุกประโยค หัวข้อย่อย หรือบรรทัดสรุปที่ใช้ข้อมูลจาก Context/แหล่งข้างต้น " +
      "ต้องใส่เลขอ้างอิงต่อท้ายในรูปแบบ [n] เช่น [1] หรือ [1][3] " +
      "ใช้ได้เฉพาะเลขที่มีในรายการเท่านั้น ห้ามสร้างเลขใหม่ ห้ามใส่เลขในหัวข้อใหญ่ (heading) " +
      "ถ้าไม่แน่ใจว่าข้อมูลมาจากแหล่งใด ไม่ต้องใส่เลข และห้ามพิมพ์รายการแหล่งอ้างอิงซ้ำท้ายคำตอบ",
  };
}

/**
 * ปรับเลขอ้างอิงจากโมเดลให้เป็นรูปแบบเดียว: 【n】/[n] → [n]
 * แล้วตัดเลขที่เกินรายการจริง (เช่น [9] ทั้งที่มี 5 แหล่ง) ออกจากคำตอบ
 */
export function stripInvalidCitationMarkers(text, maxIndex) {
  if (!Number.isFinite(maxIndex) || maxIndex <= 0) return String(text || "");
  return String(text || "")
    .replace(/【(\d{1,2})】/g, "[$1]")
    .replace(/\[(\d{1,2})\]/g, (match, num) => {
      const n = Number(num);
      return n >= 1 && n <= maxIndex ? match : "";
    });
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
