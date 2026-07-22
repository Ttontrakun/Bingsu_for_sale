import express from "express";
import { prisma } from "../db.js";
import { authenticate } from "../lib/auth.js";
import { logEvent } from "../lib/logging.js";
import { getNtCorpInternetPricingReply } from "../services/ntCorpPricingDb.js";
import {
  cacheDel,
  cacheGet,
  cacheSet,
  conversationMessagesKey,
  invalidateConversationCaches,
  userCacheKey,
} from "../lib/cache.js";
import { buildContextPiecesWithNeighbors, ensureSourceFileBlocks, getFallbackContextFromDocuments, filterContextDocsByIds, stripRedundantShortSummary, buildFallbackGroundingChunksFromDocuments, mergeHybridChunks } from "../services/text.js";
import { retrieveGroundingChunks, retrieveGroundingGroups, invalidateRagCacheForDocument, invalidateAllRagCache } from "../services/rag.js";
import { updateChunkText, replaceTextInDocument, deleteDocumentVectors, indexDocumentChunks } from "../services/vectorDb.js";
import { callOpenAiGateway, callOpenAiGatewayStream, isGreeting, isGreetingOnly } from "../services/chat.js";
import { getOrCreateUsageDaily } from "../services/usage.js";
import { buildPersonalInfoWarning } from "../lib/privacy.js";
import { CONTEXT_NEIGHBOR_WINDOW, FREE_DAILY_TOKEN_LIMIT, FREE_KNOWLEDGE_LIMIT, GREETING_REPLY, MAX_CHAT_HISTORY_MESSAGES, MAX_CONTEXT_PIECES, MAX_DAILY_CHAT_MESSAGES, openaiModel, deterministicRulesEnabled } from "../config.js";

export const conversationsRouter = express.Router();
export const messagesRouter = express.Router();
export const chatRouter = express.Router();
export const privateContextRouter = express.Router();

// จำกัดขนาดเนื้อหาส่วนตัว (กัน token เกิน/ค่าใช้จ่ายพุ่ง) — เฟส 1 ใช้ inline
const MAX_PRIVATE_CONTEXT_CHARS = Number(process.env.MAX_PRIVATE_CONTEXT_CHARS || 12000);

/** โหลดเนื้อหาส่วนตัวของผู้ใช้ (คืน "" ถ้าไม่มี/ปิดอยู่ เมื่อ requireEnabled=true) */
const loadUserPrivateContent = async (userId, { requireEnabled = false } = {}) => {
  try {
    if (!userId) return "";
    const row = await prisma.privateContext.findUnique({ where: { userId } });
    if (!row) return "";
    if (requireEnabled && !row.enabled) return "";
    return String(row.content ?? "").slice(0, MAX_PRIVATE_CONTEXT_CHARS);
  } catch (error) {
    console.warn("loadUserPrivateContent failed", error?.message || error);
    return "";
  }
};

// จำกัดขนาดคำสั่ง AI และความจำข้ามแชท
const MAX_PRIVATE_INSTRUCTIONS_CHARS = Number(process.env.MAX_PRIVATE_INSTRUCTIONS_CHARS || 2000);
const MAX_PRIVATE_MEMORY_CHARS = Number(process.env.MAX_PRIVATE_MEMORY_CHARS || 3000);

/** โหลด "คำสั่ง AI" + "ข้อมูล/ความรู้" ของผู้ใช้ (โหมดส่วนตัว) */
const loadPrivateContextParts = async (userId) => {
  try {
    if (!userId) return { instructions: "", knowledge: "" };
    const row = await prisma.privateContext.findUnique({ where: { userId } });
    if (!row) return { instructions: "", knowledge: "" };
    return {
      instructions: String(row.instructions ?? "").slice(0, MAX_PRIVATE_INSTRUCTIONS_CHARS),
      knowledge: String(row.content ?? "").slice(0, MAX_PRIVATE_CONTEXT_CHARS),
    };
  } catch (error) {
    console.warn("loadPrivateContextParts failed", error?.message || error);
    return { instructions: "", knowledge: "" };
  }
};

/** ความจำข้ามแชท: ดึง "ข้อความผู้ใช้" ล่าสุดจากห้องส่วนตัวอื่น (ลดโอกาสโดนคำตอบเก่าของบอทกดทับ) */
const loadCrossChatMemory = async (userId, currentConversationId) => {
  try {
    if (!userId) return "";
    const rows = await prisma.message.findMany({
      where: {
        role: "user",
        conversation: {
          userId,
          private: true,
          ...(currentConversationId ? { id: { not: currentConversationId } } : {}),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 16,
      select: { role: true, content: true },
    });
    const lines = rows
      .reverse()
      .map((m) => {
        const text = String(m.content ?? "").trim();
        if (!text || isRedactedPlaceholder(text)) return "";
        return `ผู้ใช้: ${text}`;
      })
      .filter(Boolean);
    if (lines.length === 0) return "";
    let joined = lines.join("\n");
    if (joined.length > MAX_PRIVATE_MEMORY_CHARS) {
      // เก็บส่วนท้าย (ล่าสุด) ไว้
      joined = joined.slice(joined.length - MAX_PRIVATE_MEMORY_CHARS);
    }
    return joined;
  } catch (error) {
    console.warn("loadCrossChatMemory failed", error?.message || error);
    return "";
  }
};

/** สร้าง system messages สำหรับโหมดส่วนตัว (คำสั่ง / ข้อมูล / ความจำ) */
const buildPrivateSystemMessages = ({ instructions, knowledge, memory }) => {
  const out = [];
  if (instructions) {
    out.push({
      role: "system",
      content: `คำสั่งจากผู้ใช้ (User Instructions — ต้องทำตามอย่างเคร่งครัดในการตอบทุกครั้ง):\n${instructions}`,
    });
  }
  if (knowledge) {
    out.push({
      role: "system",
      content: `ข้อมูล/ความรู้ส่วนตัวจากผู้ใช้ (Private Knowledge — ผู้ใช้ให้มาเอง ใช้ตอบได้เต็มที่ และมีน้ำหนักสำหรับเคสของผู้ใช้; ถ้าขัดกับ Context จากเอกสารระบบ ให้แจ้งทั้งสองมุม):\n${knowledge}`,
    });
  }
  if (memory) {
    out.push({
      role: "system",
      content: `บทสนทนาก่อนหน้าของผู้ใช้ (Cross-chat Memory — ใช้เพื่อความต่อเนื่อง จำสิ่งที่เคยคุย/ถามในห้องส่วนตัวก่อนหน้า ถ้าเกี่ยวข้องกับคำถามปัจจุบัน):\n${memory}`,
    });
  }
  return out;
};

// GET /api/private-context — ดึงเนื้อหาส่วนตัวของผู้ใช้ปัจจุบัน
privateContextRouter.get("/", authenticate, async (req, res) => {
  try {
    const row = await prisma.privateContext.findUnique({ where: { userId: req.user.id } });
    res.json({
      instructions: row?.instructions ?? "",
      content: row?.content ?? "",
      enabled: row?.enabled ?? false,
      maxChars: MAX_PRIVATE_CONTEXT_CHARS,
      maxInstructionsChars: MAX_PRIVATE_INSTRUCTIONS_CHARS,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("get private-context failed", error);
    res.status(500).json({ error: "Failed to load private context" });
  }
});

// PUT /api/private-context — บันทึก/อัปเดตเนื้อหาส่วนตัว + สถานะเปิดโหมด
privateContextRouter.put("/", authenticate, async (req, res) => {
  try {
    const hasContent = typeof req.body?.content === "string";
    const hasInstructions = typeof req.body?.instructions === "string";
    const content = hasContent ? req.body.content.slice(0, MAX_PRIVATE_CONTEXT_CHARS) : undefined;
    const instructions = hasInstructions ? req.body.instructions.slice(0, MAX_PRIVATE_INSTRUCTIONS_CHARS) : undefined;
    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined;
    const row = await prisma.privateContext.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        content: content ?? "",
        instructions: instructions ?? "",
        enabled: enabled ?? false,
      },
      update: {
        ...(content === undefined ? {} : { content }),
        ...(instructions === undefined ? {} : { instructions }),
        ...(enabled === undefined ? {} : { enabled }),
      },
    });
    // Log แบบ action-level: ผู้ใช้บันทึกความจำ/คำสั่งส่วนตัว (/จำ = knowledge, /สั่ง = instructions)
    // เก็บเฉพาะ metadata ไม่เก็บเนื้อหาจริง
    logEvent({
      event: "user.private_context.updated",
      actorId: req.user?.id,
      targetType: "privateContext",
      targetId: req.user?.id,
      meta: {
        savedInstructions: typeof instructions === "string" && instructions.trim().length > 0,
        savedKnowledge: typeof content === "string" && content.trim().length > 0,
        enabled: row.enabled,
      },
    }).catch(() => {});
    res.json({
      instructions: row.instructions,
      content: row.content,
      enabled: row.enabled,
      maxChars: MAX_PRIVATE_CONTEXT_CHARS,
      maxInstructionsChars: MAX_PRIVATE_INSTRUCTIONS_CHARS,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    console.error("put private-context failed", error);
    res.status(500).json({ error: "Failed to save private context" });
  }
});

const HELP_BOT_NAME = "บอทช่วยสอน";
const REDACTED_PLACEHOLDERS = new Set([
  "[REDACTED_USER_MESSAGE]",
  "[REDACTED_CONVERSATION_TITLE]",
]);
const isRedactedPlaceholder = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (REDACTED_PLACEHOLDERS.has(text)) return true;
  return /^\[REDACTED_[A-Z_]+\]$/i.test(text);
};
const resolveConversationTitle = (title, lastMessage) => {
  const normalizedTitle = String(title || "").trim();
  if (normalizedTitle && !isRedactedPlaceholder(normalizedTitle)) return normalizedTitle;
  const normalizedLast = String(lastMessage || "").trim();
  if (normalizedLast && !isRedactedPlaceholder(normalizedLast)) {
    return normalizedLast.slice(0, 80);
  }
  return "New Chat";
};
const sanitizeRedactedContentForClient = (content) => {
  const normalized = String(content || "").trim();
  if (isRedactedPlaceholder(normalized)) return "";
  return content;
};
// กฎกันแต่งข้อมูล/ตัวเลข (grounding) — รวมไว้ที่เดียว ใช้ร่วมทุก path การตอบ (stream + non-stream)
// ต้องการแก้กฎเรื่อง "ห้ามแต่งตัวเลข / ไม่พบข้อมูลให้บอกตรงๆ" ให้แก้ที่นี่จุดเดียว
const GROUNDING_FACT_RULES = [
  "- ข้อเท็จจริง/ตัวเลข/ราคา/อำนาจอนุมัติ ต้องยึดจาก Context (ฐานข้อมูลระบบ) เท่านั้น ห้ามนำตัวเลขหรือข้อเท็จจริงจากประวัติสนทนามาตอบ — ใช้ประวัติเพียงเพื่อเข้าใจว่าผู้ใช้กำลังอ้างถึงอะไร",
  "- ถ้า Context ไม่มีข้อมูลของสิ่งที่ผู้ใช้ถามถึงโดยตรง (ชื่อบริการ/รายการที่ระบุ) ห้ามเดา ห้ามหยิบตัวเลข/ราคา/ส่วนลดจากบริการอื่นที่ใกล้เคียงมาตอบแทน และห้ามแต่งตัวเลขขึ้นเอง — ให้ตอบตรงๆ ว่า 'ไม่พบข้อมูลรายการนี้ในเอกสาร' ถ้าพบเฉพาะข้อมูลใกล้เคียงให้ระบุชัดว่าเป็นของบริการอื่น (ไม่ใช่สิ่งที่ถาม)",
  "- เลขคำสั่ง/เลขที่เอกสาร/เลขบันทึก (เช่น รบ.7/2569, มต./2159) ให้ตอบได้เฉพาะเมื่อ Context ผูกเลขนั้นกับ 'บริการ/หัวข้อที่ผู้ใช้ถามโดยตรง' ในเนื้อหาชิ้นเดียวกันเท่านั้น ห้ามหยิบเลขคำสั่งจากเอกสารคนละหัวข้อ (เช่น ถามเรื่องเสาโทรคมนาคม แต่ Context มีแต่เลขคำสั่งของ Dark Fiber) มาตอบ และห้ามอนุมานเองว่าเอกสารหนึ่งครอบคลุมอีกหัวข้อ — ถ้าไม่พบเลขคำสั่งที่ผูกกับหัวข้อที่ถามตรงๆ ให้ตอบว่า 'ไม่พบคำสั่ง/เอกสารอ้างอิงสำหรับรายการนี้ในเอกสาร' อย่าเดาและอย่าแต่งเหตุผลโยงไปเอกสารอื่น",
];

const GEMINI_LIKE_RESPONSE_FORMAT_RULES = [
  "RESPONSE FORMAT (Gemini-like, readable):",
  "- ตอบแบบ 2 ชั้นเสมอ: (1) คำตอบสั้นตรงประเด็น 1-2 บรรทัดก่อน (2) รายละเอียดเฉพาะที่จำเป็นเท่านั้น",
  "- ถ้าคำถามง่าย/ตรง: ให้มีเฉพาะคำตอบสั้น ไม่ต้องขยาย",
  "- ห้ามขึ้นต้นคำตอบด้วยวลีอ้างอิงเอกสาร เช่น 'ตามเอกสารที่ส่งมาด้วย', 'จากเอกสารที่ให้มา', 'อ้างอิงจากเอกสาร' — ให้ตอบเนื้อหาโดยตรงทันที",
  "- ถ้าเป็นคำถามประเภท 'ใครอนุมัติ/ใครรับผิดชอบ/ใครมีอำนาจ': ให้ตอบรูปแบบนี้ก่อนเสมอ -> 'ผู้อนุมัติ: ...' และบรรทัดถัดไป 'หมายเหตุ: ...' (ถ้ามีเงื่อนไขเช่น ต้องผ่าน PM ก่อน)",
  "- สำหรับคำถามประเภท 'ใครอนุมัติ/ใครรับผิดชอบ/ใครมีอำนาจ': ห้ามใส่รายละเอียดเพิ่มเกิน 2 บรรทัด เว้นแต่ผู้ใช้ขอรายละเอียดเพิ่ม",
  "- สำหรับคำถามประเภท 'ใครอนุมัติ/ใครรับผิดชอบ/ใครมีอำนาจ': ถ้าพบชื่อย่อหรือชื่อเต็ม ให้แสดงทั้งสองแบบในบรรทัดเดียว เช่น 'กจญ. (กรรมการผู้จัดการใหญ่)'",
  "- ถ้าคำถามซับซ้อน: ส่วนรายละเอียดให้จัดเป็นหัวข้อสั้นๆ พร้อม bullet points ที่อ่านง่าย",
  "- ห้ามเกริ่นยาวหรือทวนคำถามผู้ใช้ซ้ำ",
  "- ถ้าเป็นคำแนะนำเชิงขั้นตอน ให้ใช้ลำดับเลข 1) 2) 3)",
  "- ใช้ Markdown table เฉพาะกรณีเปรียบเทียบหลายตัวเลือกจริงๆ หรือข้อมูลตารางจาก Context เท่านั้น",
  "- หัวข้อ 'สรุปสั้นๆ': ใช้เฉพาะเมื่อคำตอบยาว มีหลายหัวข้อ — ในย่อหน้านั้นต้องเพิ่มมุมมองใหม่หรือรวบรัดคนละแบบกับประโยคเปิด ห้ามคัดลอกหรือพูดซ้ำถ้อยคำเดียวกับด้านบนโดยไม่มีข้อมูลเพิ่ม",
  "- ถ้าคำตอบสั้นหรือกระชับพออยู่แล้ว (ไม่เกินประมาณครึ่งจอเล็กหรือไม่เกินหลายย่อหน้าเล็ก): ห้ามใส่ 'สรุปสั้นๆ'",
  "- โทนคำตอบสุภาพ กระชับ ไม่เยิ่นเย้อ",
  "- SOURCES / CITATIONS: อย่าใส่ชื่อไฟล์ ฟุตโน้ต เลขอ้างอิง [1] ข้อความ 'อ้างอิงจาก' / 'Sources:' / 'ที่มาจากเอกสาร' ในเนื้อคำตอบ — ผู้ใช้จะเห็นการ์ดเอกสารแหล่งที่มาด้านล่างคำตอบในระบบแยกต่างหาก",
];

/* analysis-feature edits: query-rewriting, multi-question, grounding */
/**
 * ประกอบ context แบบแยกบล็อกตามคำถาม (sectioned) สำหรับโหมดหลายคำถาม
 * แต่ละข้อได้บล็อกป้ายกำกับของตัวเอง เพื่อให้โมเดลไม่สับสนว่าข้อมูล/เลขคำสั่งชิ้นไหนของข้อไหน
 */
const buildSectionedContext = (groups, perQuestionPieces = 5) => {
  const blocks = [];
  (groups || []).forEach((g, i) => {
    const texts = (g?.chunks || [])
      .map((c) => c?.retrievedContext?.text ?? c?.payload?.text)
      .filter(Boolean)
      .slice(0, perQuestionPieces);
    if (!texts.length) return;
    blocks.push(`【ข้อมูลสำหรับคำถามข้อ ${i + 1}: ${g.question}】\n${texts.join("\n\n")}`);
  });
  return blocks.join("\n\n==============================\n\n");
};

/** สร้างรายการอ้างอิง (เอกสารที่ใช้ตอบ) จาก groundingChunks + contextDocuments */
function buildReferences(groundingChunks, contextDocuments, primaryDocument) {
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

const PRIVATE_REFERENCE = { docId: "__private__", displayName: "เนื้อหาส่วนตัวของคุณ", positions: [] };

/**
 * อ้างอิงสำหรับการตอบจริง: ในโหมดส่วนตัวให้เพิ่ม "เนื้อหาส่วนตัวของคุณ" ไว้บนสุด
 * และถ้าไม่มีหลักฐานจริงจากเอกสารระบบ จะไม่อ้างอิงเอกสารระบบแบบเดา (กันอ้างอิงผิด)
 */
function buildReferencesForReply({ groundingChunks, contextDocuments, primaryDocument, message, hasPrivateContext }) {
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

/** ความรู้เกี่ยวกับระบบ (สำหรับบอทช่วยสอน) — ครอบคลุมเกือบทุกฟีเจอร์ในเว็บ */
function getHelpBotSystemKnowledge() {
  const knowledgeLimit = Number.isFinite(FREE_KNOWLEDGE_LIMIT) ? FREE_KNOWLEDGE_LIMIT : 30;
  const tokenLimit = Number.isFinite(FREE_DAILY_TOKEN_LIMIT) ? FREE_DAILY_TOKEN_LIMIT : 50000;
  const chatMessagesLimit = Number.isFinite(MAX_DAILY_CHAT_MESSAGES) ? MAX_DAILY_CHAT_MESSAGES : 2000;
  return `
คุณคือบอทช่วยสอนการใช้งานระบบบิงซูบอท (Enterprise AI Chatbot Bot) คุณรู้จักระบบเกือบทุกอย่าง — ใช้ตอบคำถามวิธีใช้ ขั้นตอน กดตรงไหน เปลี่ยนโปรไฟล์ ลบแชท จำกัดการใช้งาน ได้เสมือนคุณเข้าใจทั้งระบบ

ความรู้เกี่ยวกับระบบ (ใช้ตอบเมื่อผู้ใช้ถามวิธีใช้):

【หน้าแรก / การแชท】
- หน้าแรก (Homepage): มี dropdown "Select Knowledge" เลือกชุดความรู้, dropdown "Select Bot" เลือกบอท (ถ้ามีหลายตัว), และช่องพิมพ์คำถามด้านล่าง — เลือก Knowledge กับ Bot แล้วพิมพ์คำถามแล้วกดส่งหรือ Enter เพื่อเริ่มแชท
- การแชท: หลังส่งคำถาม ระบบจะสร้างบทสนทนาใหม่และพาไปหน้าแชท — ในแชทสามารถถามติดตามได้ (บอทจดจำคำถามก่อนหน้า)
- ในแชทผู้ใช้สามารถสั่งบอทเปลี่ยนสไตล์การพูดได้ เช่น "ใช้ค่ะแทนครับ" "คุยแบบเพื่อน" โดยพิมพ์ในแชทแล้วบอทจะตอบตามนั้น

【แถบด้านข้าง (Sidebar)】
- ด้านบน: ลิงก์ไป หน้าแรก, Bots, Knowledge
- กลาง: รายการบทสนทนา (แชท) ที่เคยเปิด — คลิกเพื่อกลับไปแชทนั้น
- แต่ละแชทมีปุ่มเมนู (จุดสามจุดหรือไอคอนเมนู) — กดแล้วเลือก "ลบ" เพื่อลบประวัติสนทนานั้น (จะมีกล่องยืนยัน "คุณต้องการลบแชทนี้หรือไม่") ลบแล้วแชทจะหายจากรายการและไม่กู้คืนได้
- ด้านล่าง: รูปโปรไฟล์และคำว่า "Profile" — คลิกเพื่อเปิดเมนูโปรไฟล์ (Profile modal)

【โปรไฟล์ / เปลี่ยนรูป / ตั้งค่าบัญชี】
- คลิกรูปโปรไฟล์หรือ "Profile" ที่แถบด้านข้างด้านล่าง → เปิดหน้าต่างโปรไฟล์
- ในหน้าต่างโปรไฟล์: มีปุ่ม "จัดการบัญชี" — กดเพื่อเปิดหน้าต่าง "ตั้งค่าบัญชี"
- ตั้งค่าบัญชี (Account): แก้ชื่อ (name), เปลี่ยนรูปโปรไฟล์ (avatar) — สามารถอัปโหลดรูปจากเครื่อง (เลือกไฟล์) หรือใส่ URL รูป แล้วกด "บันทึก" มีปุ่ม "เปลี่ยนรหัสผ่าน" ถ้าต้องการเปลี่ยนรหัสผ่าน
- อีเมลแสดงในหน้าต่างแต่โดยทั่วไปแก้ไม่ได้ (เป็นตัวตนในการล็อกอิน)

【Bots (บอท)】
- เมนู Bots (แถบด้านข้าง): ใช้สร้างและจัดการบอท — กด "สร้างบอท" หรือ "Create Bot"
- สร้างบอท: ใส่ชื่อบอท, พรอมต์ (คำสั่งให้บอทปฏิบัติ เช่น ตอบแบบสุภาพ), คำอธิบายสั้น ๆ, เลือก Knowledge ที่บอทจะใช้ตอบคำถาม แล้วบันทึก
- แก้ไข/ลบบอท: เข้าเมนู Bots แล้วเลือกบอทที่ต้องการแก้หรือลบ

【Knowledge (ชุดความรู้)】
- เมนู Knowledge (แถบด้านข้าง): ใช้สร้างชุดความรู้และอัปโหลดไฟล์ (เช่น PDF) ระบบจะประมวลผลและใช้เป็นฐานความรู้ให้บอทค้นคำตอบ
- สร้าง Knowledge: กดสร้าง Knowledge ใส่ชื่อ จากนั้นอัปโหลดไฟล์ (รองรับ PDF ฯลฯ) ระบบจะประมวลผลอัตโนมัติ
- จำนวนชุด Knowledge ที่สร้างได้: สูงสุด ${knowledgeLimit} ชุดต่อผู้ใช้ (แผนฟรี) — ถ้าถามว่า "เพิ่ม Knowledge ได้มั้ย" หรือ "จำกัดเท่าไหร่" ให้บอกว่าสร้างได้สูงสุด ${knowledgeLimit} ชุด

【การใช้งาน / โทเค็น / ข้อความต่อวัน】
- แผนฟรี: ใช้โทเค็น (Token) สำหรับแชทได้ประมาณ ${tokenLimit.toLocaleString()} โทเค็นต่อวัน; จำนวนข้อความแชทต่อวันประมาณ ${chatMessagesLimit.toLocaleString()} ข้อความ (แล้วแต่การตั้งค่าเซิร์ฟเวอร์)
- ในหน้าแชทจะมีแสดง Token ที่ใช้วันนี้ (ถ้ามี) — ถ้าถามว่า "จำกัดเท่าไหร่" หรือ "ใช้ได้วันละเท่าไหร่" ให้อ้างอิงตัวเลขด้านบน

【อื่นๆ】
- คำถามติดตาม: ถ้าผู้ใช้ถาม "ทำยังไง" "กดตรงไหน" "อธิบายเพิ่ม" "ขั้นตอนละเอียด" "เปลี่ยนรูปยังไง" "ลบแชทยังไง" — อธิบายเป็นขั้นตอนชัดเจนเป็นภาษาไทย โดยอิงจากความรู้ด้านบนและจาก Context (คู่มือ) เมื่อมี
- ห้ามดึงข้อมูลจากภายนอกระบบ (ข่าว, วิกิ ความรู้ทั่วไป สิ่งของ นิยามคำศัพท์นอกระบบ). ตอบเฉพาะเรื่องการใช้งานระบบบิงซูและจาก Context ที่ให้มาเท่านั้น
- ถ้าผู้ใช้ถามเรื่องที่ไม่เกี่ยวกับระบบหรือคู่มือ (เช่น "X คืออะไร" ที่ X เป็นสิ่งของ/คำศัพท์ทั่วไป ไม่ใช่ฟีเจอร์ในระบบ) ให้ตอบว่า "คำถามนี้อยู่นอกขอบเขตของระบบครับ ผมตอบได้เฉพาะเรื่องวิธีใช้ระบบบิงซูบอทและคู่มือการใช้งานเท่านั้น" และอย่าตอบจากความรู้ทั่วไป
`.trim();
}

const PLATFORM_VALUES = new Set(["line", "messenger", "website", "api", "sandbox"]);
const getPlatform = (req) => {
  const raw = req.headers["x-client-platform"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = String(value || "").trim().toLowerCase();
  return PLATFORM_VALUES.has(normalized) ? normalized : "website";
};

const coerceInt = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
};

const getTokenUsage = (gatewayResponse) => {
  const usage = gatewayResponse?.usage || {};
  return {
    promptTokens: coerceInt(usage.prompt_tokens ?? usage.promptTokens),
    completionTokens: coerceInt(usage.completion_tokens ?? usage.completionTokens),
    totalTokens: coerceInt(usage.total_tokens ?? usage.totalTokens),
  };
};

const getUsedTokensFromRow = (row) => {
  const t = Number(row?.totalTokens || 0);
  if (Number.isFinite(t) && t > 0) return t;
  const p = Number(row?.promptTokens || 0);
  const c = Number(row?.completionTokens || 0);
  return (Number.isFinite(p) ? p : 0) + (Number.isFinite(c) ? c : 0);
};

const normalizeText = (s) => String(s || "").trim().toLowerCase();
const AUTHORITY_ROLE_MAP = [
  { abbr: "ผจก.", full: "ผู้จัดการ", re: /(ผจก\.?|ผู้จัดการ)/i },
  { abbr: "ชจญ.", full: "ผู้ช่วยกรรมการผู้จัดการใหญ่", re: /(ชจญ\.?|ชจรย\.?|ผู้ช่วยกรรมการผู้จัดการใหญ่)/i },
  { abbr: "รจญ.", full: "รองกรรมการผู้จัดการใหญ่", re: /(รจญ\.?|รองกรรมการผู้จัดการใหญ่)/i },
  { abbr: "กจญ.", full: "กรรมการผู้จัดการใหญ่", re: /(กจญ\.?|กรรมการผู้จัดการใหญ่)/i },
];
const formatAuthorityRole = (value) => {
  const text = String(value || "").trim();
  if (!text) return text;
  const match = AUTHORITY_ROLE_MAP.find((entry) => entry.re.test(text));
  if (!match) return text;
  return `${match.abbr} (${match.full})`;
};
const isAuthorityDecisionQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(ใครอนุมัติ|ผู้อนุมัติ|ใครมีอำนาจ|มีอำนาจอนุมัติ|อำนาจอนุมัติ|อำนาจของท่าน|ผู้มีอำนาจ|ท่านใด|ใครรับผิดชอบ|อนุมัติ.*ใคร|ใคร.*อนุมัติ|อำนาจส่วนลด|อนุมัติอัตรา|ส่วนลดเฉพาะราย)/.test(m);
};
const isAuthorityDetailFollowUpQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(จากคำตอบก่อนหน้า|อธิบายเพิ่มเติม|ดูรายละเอียดเพิ่มเติม|อธิบายรายละเอียด|ยกตัวอย่าง|แบบเป็นข้อ|ขั้นตอน|เงื่อนไข|เข้าใจง่ายขึ้น)/.test(m);
};
const getResponseFormatRulesForMessage = (message) => {
  // Follow-up ที่ขอ "อธิบายเพิ่ม" ต้องไม่โดนกฎบีบให้เหลือ 2 บรรทัด
  if (isAuthorityDetailFollowUpQuery(message)) {
    return GEMINI_LIKE_RESPONSE_FORMAT_RULES.filter(
      (rule) => !/ใครอนุมัติ\/ใครรับผิดชอบ\/ใครมีอำนาจ/.test(rule),
    );
  }
  return GEMINI_LIKE_RESPONSE_FORMAT_RULES;
};

// สร้าง system prompt หลักของผู้ช่วย — รวม path แบบ stream (analytical=false) และ non-stream (analytical=true)
// ไว้ที่เดียว เดิมเขียนซ้ำ 2 ที่ ~28 บรรทัด/ที่. บรรทัดที่ต่างกันเล็กน้อยคุมด้วย flag analytical
const buildPolicyPrompt = ({ isHelpBot, message, overviewRequest = false, analytical = false }) => {
  if (isHelpBot) {
    const helpLines = analytical
      ? [
          "You are a helpful Thai AI assistant.",
          "Scope: ตอบจาก Context ที่ให้มาเท่านั้น ห้ามแต่งข้อมูลที่ไม่มีหลักฐาน.",
          "Rules:",
          "1) Use Context to answer and keep response concise.",
          "2) Remember previous questions for follow-up continuity.",
          "3) If outside scope, reply that context does not contain the requested information.",
          "4) Do not put filenames, footnotes, or 'อ้างอิงจาก' / Sources in the body — the UI shows sources separately.",
        ]
      : [
          "You are a helpful Thai AI assistant. Answer in the same language as the user.",
          "Scope: ตอบจาก Context ที่ให้มาเป็นหลัก และห้ามแต่งข้อมูลที่ไม่มีหลักฐาน.",
          "Rules: 1) Remember conversation for follow-ups. 2) Keep answers clear and concise. 3) If outside context, say information is unavailable.",
          "4) Do not put filenames, footnotes, or 'อ้างอิงจาก' / Sources in the body — the UI shows sources separately.",
        ];
    return helpLines.join("\n");
  }
  return [
    "You are Enterprise AI Chatbot Assistant — a smart, friendly Thai AI assistant. Answer in the same language as the user (Thai or English).",
    "CAPABILITIES (ทำได้ทั้งหมด):",
    analytical
      ? "1) General chat: ทักทาย สนทนาทั่วไป ถาม-ตอบ ให้คำแนะนำได้ตามปกติ"
      : "1) สนทนาทั่วไป: ทักทาย ถาม-ตอบ ให้คำแนะนำทั่วไปได้ตามปกติ",
    "2) Knowledge Analysis: เมื่อมี Context ให้ตอบและวิเคราะห์จาก Context เป็นหลัก (วิเคราะห์ เปรียบเทียบ สรุปได้จาก Context)",
    analytical
      ? "3) Typo/Language Tolerance: แม้ผู้ใช้พิมพ์ผิด สะกดผิด หรือใช้ภาษาไม่เป็นทางการ ให้เข้าใจเจตนาจากบริบทและตอบตามนั้น"
      : "3) Typo/Language Tolerance: แม้ผู้ใช้พิมพ์ผิด สะกดผิด ไม่เป็นทางการ ให้เข้าใจเจตนาจากบริบทและตอบตามนั้น",
    "RULES:",
    analytical
      ? "- เมื่อมี Context: ยึด Context เป็นหลักในการตอบ ห้ามแต่งข้อมูลนอก Context แต่วิเคราะห์ / เปรียบเทียบ / สรุปจาก Context ได้"
      : "- เมื่อมี Context: ยึด Context เป็นหลักในการตอบ ห้ามแต่งข้อมูลนอก Context",
    ...GROUNDING_FACT_RULES,
    analytical
      ? "- เมื่อไม่มี Context หรือ Context ไม่ตรง: ตอบสนทนาทั่วไปได้อย่างกระชับ"
      : "- เมื่อไม่มี Context: ตอบสนทนาทั่วไปได้อย่างกระชับ",
    "- ถ้าคำถามมีเงื่อนไขหลายกรณี (เช่น เปรียบเทียบ 2 ระดับส่วนลด): ให้แยกตอบเป็นรายกรณีอย่างชัดเจนในกรอบข้อมูลที่มี",
    ...(hasMultipleQuestions(message)
      ? [
          "- คำถามนี้มีหลายข้อ: ตอบ **แยกทีละข้อตามลำดับ (1, 2, 3, ...)**",
          "- Context จะมี chunk ของหลายหัวข้อปนกัน เป็นเรื่องปกติ — สำหรับแต่ละข้อ ให้ **มองหา chunk ที่ตรงกับหัวข้อของข้อนั้น** แล้วดึงคำตอบจาก chunk นั้นมาตอบตามปกติ (เช่น ข้อถามเรื่องเสาโทรคมนาคม ถ้ามี chunk ที่ระบุ 'คำสั่งของการให้บริการเสาโทรคมนาคม' ให้ตอบเลขคำสั่งนั้นได้ทันที ไม่ต้องลังเล)",
          "- ห้ามเอาคำตอบ/ตัวเลข/เลขคำสั่งของ 'หัวข้ออื่น' มาตอบข้ามข้อ (เช่น อย่าเอาเลขคำสั่งของ Dark Fiber มาตอบเรื่องเสาโทรคมนาคม) — แต่ถ้ามี chunk ที่ตรงหัวข้อของข้อนั้นจริง ต้องตอบ",
          "- ใช้ 'ไม่พบข้อมูลสำหรับข้อนี้ในเอกสาร' **เฉพาะเมื่อไม่มี chunk ที่ตรงกับหัวข้อของข้อนั้นเลยจริงๆ** เท่านั้น — ถ้ามี chunk ตรงหัวข้ออยู่ใน Context ห้ามเลี่ยงตอบหรือตอบว่าไม่พบ",
        ]
      : []),
    analytical
      ? "- จำบทสนทนาก่อนหน้าเสมอ — คำถามต่อเนื่อง (อธิบายเพิ่ม, แล้วล่ะ, ขั้นตอนถัดไป, สรุปอีกที) ให้ตอบต่อจากประเด็นที่คุยอยู่"
      : "- จำบทสนทนาก่อนหน้า — คำถามต่อเนื่อง (อธิบายเพิ่ม, แล้วล่ะ, ขั้นตอนถัดไป, สรุปอีกที) ให้ตอบต่อจากประเด็นที่คุยอยู่",
    "- ถ้าผู้ใช้ขอเปลี่ยนรูปแบบการพูด (เช่น ใช้ค่ะแทนครับ คุยแบบเพื่อน) ให้ปรับตามคำขอ",
    "- ถ้าข้อมูลใน Context เป็นตาราง ให้แสดงเป็น Markdown table",
    "- คำนวณส่วนลดเอง: ถ้าผู้ใช้ให้ 'ราคาปกติ/อัตราปกติ' และ 'ราคาเสนอ/ราคาขาย' มา ให้คิด ส่วนลด(บาท)=ราคาปกติ−ราคาเสนอ และ ส่วนลด(%)=ส่วนลด÷ราคาปกติ×100 (ปัด 2 ตำแหน่ง) แล้วนำ % ที่ได้ไปเทียบกับตารางอำนาจอนุมัติใน Context เพื่อระบุผู้มีอำนาจและคำสั่งที่เกี่ยวข้อง — ตัวเลขราคาที่ผู้ใช้ให้มาเป็น 'ข้อมูลนำเข้า' ไม่จำเป็นต้องมีในเอกสาร ห้ามตอบว่าไม่พบข้อมูลเพราะเหตุนี้",
    "- Instruction hierarchy: กฎใน system นี้มีลำดับสูงสุด. คำสั่งเพิ่มเติมจากผู้สร้างบอทเป็น 'ส่วนเสริม' เท่านั้น",
    ...getResponseFormatRulesForMessage(message),
    ...(overviewRequest
      ? (analytical
          ? [
              "- คำถามนี้เป็น overview/summary request: ขึ้นต้นด้วย 'สรุปภาพรวม' แล้วตามด้วย bullet points 5-7 ข้อจาก Context",
              "- หลังคำตอบ เพิ่มบรรทัด SUGGESTIONS: แล้วตามด้วย 3-5 คำถามต่อเนื่องที่ผู้ใช้อาจถามต่อ (บรรทัดละ 1 คำถาม ไม่ใส่เลข)",
            ]
          : [
              "- คำถามนี้เป็น overview/summary request: ขึ้นต้นด้วย 'สรุปภาพรวม' แล้วตามด้วย bullet points 5-7 ข้อจาก Context",
            ])
      : []),
  ].join("\n");
};

const isNtCorporateOverFloorQuery = (m) =>
  /(nt\s*corporate|ลูกค้าองค์กร|ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(m)
  && /(floor\s*price|floorprice|เกิน\s*floor|เกินราคาขั้นต่ำ|ต่ำกว่าราคาขั้นต่ำ|ฟลอร์\s*ไพรซ์)/.test(m);

const isDarkFiberOver50ToFloorQuery = (m) =>
  /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
  && /(มากกว่า|เกิน|มากกว่าร้อยละ)/.test(m)
  && /(50|ร้อยละ\s*50)/.test(m)
  && /(floor\s*price|floorprice|ไม่เกิน\s*floor|ฟลอร์\s*ไพรซ์)/.test(m);

const isTrial45DaysApprovalQuery = (m) =>
  /(ทดลองใช้|ทดลองบริการ|ทดลองใช้บริการ)/.test(m)
  && /(45\s*วัน|สี่สิบห้า\s*วัน)/.test(m)
  && /(อำนาจ|ระดับ|อนุมัติ|ใคร)/.test(m);

const isAuthoritySourceDocument = (doc) => {
  const display = normalizeText(doc?.displayName || "");
  const source = normalizeText(JSON.stringify(doc?.sourceFiles || ""));
  return /(ตารางสรุป_คู่มือการใช้งานระเบียบ_คำสั่งประกาศ|คู่มือการใช้ระเบียบ|super\s*product\s*manager|product\s*manager|โครงสร้างใหม่)/.test(display)
    || /(ตารางสรุป|super product manager|product manager|โครงสร้างใหม่)/.test(source);
};

const resolveAuthorityDocIds = (docs = [], fallbackDocIds = []) => {
  const scoped = (docs || [])
    .filter((doc) => doc?.id && isAuthoritySourceDocument(doc))
    .map((doc) => String(doc.id));
  return scoped.length > 0 ? Array.from(new Set(scoped)) : fallbackDocIds;
};

const resolveRetrievalTargets = (message, rawContextDocs = [], defaultDocumentIds = []) => {
  // คำถามหลายข้อมักครอบหลายหัวข้อ/หลายเอกสาร — ห้ามหด scope เป็น "เฉพาะเอกสารอำนาจอนุมัติ"
  // เพราะบางข้ออาจอยู่คนละเอกสาร (เช่น ข้อเรื่องเสาโทรคมนาคมปนกับข้อเรื่องอำนาจอนุมัติ) → ใช้ทุกเอกสารในชุด Knowledge
  if (hasMultipleQuestions(message)) {
    return { primaryDocumentIds: defaultDocumentIds, secondaryDocumentIds: null };
  }
  const primaryDocumentIds = isAuthorityDecisionQuery(message)
    ? resolveAuthorityDocIds(rawContextDocs, defaultDocumentIds)
    : defaultDocumentIds;
  const canFallbackToDefault =
    isAuthorityDecisionQuery(message)
    && primaryDocumentIds.length > 0
    && primaryDocumentIds.length < defaultDocumentIds.length;
  return {
    primaryDocumentIds,
    secondaryDocumentIds: canFallbackToDefault ? defaultDocumentIds : null,
  };
};

const getDeterministicRuleReply = (question) => {
  const m = normalizeText(question);
  if (!m) return null;
  if (isTrial45DaysApprovalQuery(m)) {
    return "ผู้อนุมัติ: ผจก. (ผู้จัดการ)\nหมายเหตุ: กรณีขออนุมัติทดลองใช้บริการ 45 วัน อยู่ในช่วงไม่เกิน 60 วัน จึงใช้อำนาจระดับฝ่าย (ผจก.)";
  }
  if (
    /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(ระยะเวลาใช้บริการขั้นต่ำ|ขั้นต่ำกี่ปี|ขั้นต่ำ.*กี่ปี)/.test(m)
  ) {
    return "ระยะเวลาใช้บริการขั้นต่ำของ NT Dark Fiber คือ 1 ปี";
  }
  if (
    /(ทดลองใช้|ทดลองผลิตภัณฑ์|ทดลองบริการ)/.test(m)
    && /(สูงสุด|นานสุด|กี่เดือน|นานเท่าไหร่)/.test(m)
  ) {
    return "การทดลองใช้ผลิตภัณฑ์/บริการใหม่กำหนดระยะเวลาเริ่มตั้งแต่ 1 เดือน และไม่เกิน 6 เดือน";
  }
  if (
    /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(end-?to-?end|last mile|neutral last mile)/.test(m)
  ) {
    return "NT Dark Fiber ให้บริการแบบ End-to-End และไม่ใช่บริการ Last Mile";
  }
  if (
    /(ค่าธรรมเนียมแรกเข้า|one time charge|otc)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
  ) {
    return "ค่าธรรมเนียมแรกเข้า NT Dark Fiber (One Time Charge) คือ 7,000 บาท/ครั้ง";
  }
  if (
    /(ค่าบริการรายเดือน|รายเดือนเท่าไหร่|เท่าไหร่ต่อเดือน)/.test(m)
    && /(แขวนอากาศ)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
  ) {
    return "ค่าบริการรายเดือน NT Dark Fiber แบบแขวนอากาศ คือ 1,500 บาท/core/กม./เดือน";
  }
  if (
    /(ล่วงหน้า\s*12\s*เดือน|12\s*เดือน.*ล่วงหน้า)/.test(m)
    && /(ส่วนลด|discount)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
  ) {
    return "ชำระค่า NT Dark Fiber ล่วงหน้า 12 เดือน ได้ส่วนลด 5% (เฉพาะอัตรา Price List)";
  }
  if (
    /(ผจก\.?|ผู้จัดการฝ่าย|ระดับฝ่าย)/.test(m)
    && /(nt\s*corporate|corporate internet)/.test(m)
    && /(ไม่เกิน|ได้ไม่เกิน|สูงสุด)/.test(m)
    && /(กี่|กี่\s*%|เปอร์เซ็นต์|%)/.test(m)
  ) {
    return "ผจก.ฝ่าย ให้ส่วนลดค่าบริการ NT Corporate Internet ได้ไม่เกิน 30% จากอัตราปกติ";
  }
  if (
    /(ลักลอบใช้|ลักลอบ)/.test(m)
    && /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(m)
    && /(ค่าดำเนินการ|ค่าเสียหาย|เท่าไหร่|เท่าไร)/.test(m)
  ) {
    return "ค่าดำเนินการกรณีลักลอบใช้ NT Dark Fiber คือ 50,000 บาท/ครั้ง และต้องชำระค่าเสียหาย 10 เท่าของอัตราปกติ";
  }
  return null;
};

/**
 * ตรวจว่าข้อความน่าจะมี "หลายคำถาม/หลายส่วน" หรือไม่ (เช่น ถามคำถามฟิก + พ่วงอีกคำถาม)
 * ใช้เพื่อไม่ให้ระบบตอบแค่คำตอบฟิกแล้วตัดจบ — ถ้าเป็น multi ให้ส่งต่อให้ LLM ตอบครบทุกส่วน
 */
const hasMultipleQuestions = (message) => {
  const m = String(message || "").trim();
  if (!m) return false;
  // เครื่องหมายคำถามตั้งแต่ 2 ตัวขึ้นไป = หลายคำถามชัดเจน
  const qMarks = (m.match(/[?？]/g) || []).length;
  if (qMarks >= 2) return true;
  // รายการที่ขึ้นต้นด้วยเลขตั้งแต่ 2 ข้อ เช่น "1. ... 2. ... 3. ..." = หลายคำถามชัดเจน (สอดคล้องกับตัวแยกใน rag.js)
  const numberedItems = (m.match(/(?:^|\s)\d{1,2}[.)]+\s+\S/g) || []).length;
  if (numberedItems >= 2) return true;
  // นับ "คำบ่งชี้คำถาม" และตัวเชื่อมที่มักคั่นหลายประเด็น
  const questionCueCount = (m.match(/(เท่าไหร่|เท่าไร|กี่|อะไร|ยังไง|อย่างไร|ทำไม|ที่ไหน|ใคร|เมื่อไหร่|ไหม|มั้ย|หรือไม่|ขั้นต่ำ|สูงสุด|นานสุด)/g) || []).length;
  const conjCount = (m.match(/(และ|กับ|อีกอย่าง|อีกข้อ|อีกคำถาม|รวมถึง|พร้อมทั้ง|แล้วก็|และก็|ส่วน)/g) || []).length;
  if (questionCueCount >= 2 && conjCount >= 1) return true;
  return false;
};

/**
 * แปลงคำถามต่อเนื่อง (follow-up) ให้เป็นคำถามสมบูรณ์แบบ standalone โดยอาศัยประวัติสนทนา
 * เพื่อให้ embed/retrieval ดึง chunk ได้ตรง (แก้ปัญหาถามต่อเนื่องแล้วระบบดึงข้อมูลผิด)
 * ถ้าไม่ใช่ follow-up หรือไม่มีประวัติ/เขียนใหม่ไม่สำเร็จ → คืนค่าข้อความเดิม
 */
const buildStandaloneQuery = async (message, conversationId) => {
  try {
    // ปิด LLM rewrite โดยดีฟอลต์เพื่อความเร็ว (ตั้ง RAG_STANDALONE_REWRITE=1 เพื่อเปิด)
    // คำถามต่อเนื่องยังค้นเจอได้จากกลไก history-merge ใน resolveGroundingChunks ที่ไม่ต้องเรียก LLM
    if (process.env.RAG_STANDALONE_REWRITE !== "1") return message;
    if (!isLikelyFollowUp(message)) return message;
    const recent = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { role: true, content: true },
    });
    if (!recent.length) return message;
    const historyText = recent
      .reverse()
      .map((r) => `${r.role === "model" ? "ผู้ช่วย" : "ผู้ใช้"}: ${String(r.content ?? "").trim()}`)
      .filter((line) => line.length > 6)
      .join("\n");
    if (!historyText) return message;
    const resp = await callOpenAiGateway([
      {
        role: "system",
        content:
          "เขียน 'คำถามล่าสุด' ของผู้ใช้ใหม่ให้เป็นคำถามสมบูรณ์แบบ standalone โดยรวมบริบทจากประวัติสนทนา " +
          "(แทนคำสรรพนาม/คำอ้างอิง เช่น 'อันนี้' 'แบบนั้น' 'อันที่สอง' ด้วยสิ่งที่อ้างถึงจริง). " +
          "ตอบกลับเฉพาะข้อความคำถามที่เขียนใหม่บรรทัดเดียว ไม่มีคำอธิบาย ไม่มีเครื่องหมายคำพูด. " +
          "ถ้าคำถามสมบูรณ์ในตัวอยู่แล้ว ให้ส่งกลับข้อความเดิม.",
      },
      { role: "user", content: `ประวัติ:\n${historyText}\n\nคำถามล่าสุด: ${message}\n\nคำถาม standalone:` },
    ]);
    const rewritten = resp?.choices?.[0]?.message?.content?.trim();
    if (rewritten && rewritten.length > 0 && rewritten.length <= 400) {
      if (process.env.DEBUG_RAG === "1") {
        console.log(`[rag] standalone rewrite: "${message}" -> "${rewritten}"`);
      }
      return rewritten;
    }
  } catch (error) {
    console.warn("buildStandaloneQuery failed, using original message", error?.message || error);
  }
  return message;
};

/**
 * ดึง "คำถามล่าสุดของผู้ใช้" ก่อนหน้านี้ในห้องสนทนา เพื่อนำมาเสริมตอนค้น embedding
 * (ช่วงนี้ข้อความปัจจุบันยังไม่ถูกบันทึก จึง row ล่าสุด = คำถามก่อนหน้า)
 * ข้าม prompt ที่ระบบสร้างจากปุ่ม follow-up เพื่อให้ได้คำถามหลักจริงของผู้ใช้
 */
const getPreviousUserQuestionForRetrieval = async (conversationId, currentMessage) => {
  try {
    if (!conversationId) return "";
    const rows = await prisma.message.findMany({
      where: { conversationId, role: "user" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { content: true },
    });
    const current = normalizeText(currentMessage);
    let fallback = "";
    let firstNonGenerated = "";
    for (const row of rows) {
      const text = String(row?.content ?? "").trim();
      if (text.length < 6) continue;
      if (normalizeText(text) === current) continue;
      if (!fallback) fallback = text;
      // ข้ามคำถามที่ระบบสร้างจากปุ่ม follow-up เพื่อให้ได้คำถามหลักจริง
      const m = normalizeText(text);
      const looksGenerated = /^จากคำตอบก่อนหน้า/.test(m) || isAuthorityDetailFollowUpQuery(text);
      if (looksGenerated) continue;
      if (!firstNonGenerated) firstNonGenerated = text;
      // ข้ามคำถามที่เป็น follow-up สั้นๆ ในตัวมันเอง (เช่น "ถ้า 70 วันได้มั้ย", "50 วันล่ะ")
      // เพื่อหา "คำถามหลัก" ที่มี keyword จริงไปเสริม retrieval (กันการดึง chunk ผิดเรื่อง)
      if (isLikelyFollowUp(text)) continue;
      if (extractEvidenceTokens(text).length >= 2) return text;
    }
    return firstNonGenerated || fallback;
  } catch (error) {
    console.warn("getPreviousUserQuestionForRetrieval failed", error?.message || error);
    return "";
  }
};

/**
 * ค้น grounding chunks โดยอิง "ทั้งประวัติคำถามก่อนหน้า + embedding"
 * ขั้นตอน: primary docs → secondary docs → ถ้ายังไม่พอ ให้รวมคำถามก่อนหน้าแล้วค้นซ้ำ
 * แก้ปัญหา follow-up ที่ข้อความสั้น/ไม่มี keyword จน embedding ค้นไม่เจอ แล้วระบบตอบว่า "ไม่พบข้อมูล"
 * คืนค่า { groundingChunks, retrievalDocumentIds, usedHistory }
 */
const resolveGroundingChunks = async ({
  message,
  conversationId,
  retrievalQuery,
  primaryDocumentIds,
  secondaryDocumentIds,
  fast = false,
}) => {
  let retrievalDocumentIds = primaryDocumentIds;
  let groundingChunks = await retrieveGroundingChunks(retrievalDocumentIds, retrievalQuery, { fast });
  if (
    secondaryDocumentIds
    && (groundingChunks.length === 0 || !hasSufficientGroundingEvidence(message, groundingChunks))
  ) {
    retrievalDocumentIds = secondaryDocumentIds;
    groundingChunks = await retrieveGroundingChunks(retrievalDocumentIds, retrievalQuery, { fast });
  }

  const insufficient =
    groundingChunks.length === 0 || !hasSufficientGroundingEvidence(message, groundingChunks);
  if (!insufficient) {
    return { groundingChunks, retrievalDocumentIds, usedHistory: false };
  }

  const prevQuestion = await getPreviousUserQuestionForRetrieval(conversationId, message);
  if (!prevQuestion) {
    return { groundingChunks, retrievalDocumentIds, usedHistory: false };
  }

  // รวมคำถามก่อนหน้าเข้ากับคำถามปัจจุบัน เพื่อให้ embedding มี keyword พอจะค้นเจอ
  const mergedQuery = `${prevQuestion}\n${retrievalQuery}`.trim();
  if (process.env.DEBUG_RAG === "1") {
    console.log(
      `[rag] history-merge: msg="${message}" | retrievalQuery="${retrievalQuery}" | prevQuestion="${prevQuestion}" | merged="${mergedQuery.replace(/\n/g, " | ")}"`,
    );
  }
  const candidateIdSets = [primaryDocumentIds, secondaryDocumentIds].filter(Boolean);
  for (const ids of candidateIdSets) {
    const mergedChunks = await retrieveGroundingChunks(ids, mergedQuery, { fast });
    if (mergedChunks.length === 0) continue;
    // ประเมินหลักฐานด้วย mergedQuery (คำถามปัจจุบันเดี่ยวๆ มักไม่มี keyword)
    if (hasSufficientGroundingEvidence(mergedQuery, mergedChunks)) {
      if (process.env.DEBUG_RAG === "1") {
        const preview = String(
          mergedChunks[0]?.retrievedContext?.text ?? mergedChunks[0]?.payload?.text ?? "",
        ).slice(0, 120);
        console.log(`[rag] history-merge matched ${mergedChunks.length} chunk(s). first: "${preview}"`);
      }
      return { groundingChunks: mergedChunks, retrievalDocumentIds: ids, usedHistory: true };
    }
    if (mergedChunks.length > groundingChunks.length) {
      groundingChunks = mergedChunks;
      retrievalDocumentIds = ids;
    }
  }
  return { groundingChunks, retrievalDocumentIds, usedHistory: groundingChunks.length > 0 };
};

const getAuthorityOverrideFromQuestion = (question) => {
  const m = normalizeText(question);
  if (!m) return null;
  const isNtCorporateDiscountCase =
    /(nt\s*corporate|ลูกค้าองค์กร|ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(m) &&
    /(floor\s*price|floorprice|เกิน\s*floor|เกินราคาขั้นต่ำ|ต่ำกว่าราคาขั้นต่ำ|ฟลอร์\s*ไพรซ์)/.test(m);
  if (isNtCorporateDiscountCase) {
    return {
      approver: "รจญ.",
      note: "ต้องผ่านการพิจารณาจากฝ่ายบริหารจัดการผลิตภัณฑ์ (PM) ก่อนเสนออนุมัติ",
    };
  }
  if (/(เส้นใยแก้วนำแสง|nt dark fiber)/.test(m) && /(ไม่เกินร้อยละ\s*50|ไม่เกิน\s*50|price list)/.test(m)) {
    return {
      approver: "ชจญ.",
      note: "ชจญ.ที่รับผิดชอบงานขาย/บริการลูกค้า (ต้องผ่านความเห็น PM ก่อน)",
    };
  }
  if (
    /(ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร|นำรายการส่งเสริมการขายไปให้ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(m)
  ) {
    return {
      approver: "รจญ.",
      note: "ต้องผ่านการพิจารณาจากฝ่ายบริหารจัดการผลิตภัณฑ์ (PM) ก่อนเสนออนุมัติ",
    };
  }
  return null;
};

const getAuthorityOverrideFromReply = (reply) => {
  const r = normalizeText(reply);
  if (!r) return null;
  const hasFloorPrice = /(floor\s*price|floorprice|เกิน\s*floor|เกินราคาขั้นต่ำ|ต่ำกว่าราคาขั้นต่ำ|ฟลอร์\s*ไพรซ์)/.test(r);
  const hasCorporateHint = /(nt\s*corporate|ลูกค้าองค์กร|ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(r);
  const hasPmWorkflowHint = /(pm|ผู้จัดการผลิตภัณฑ์|บริหารจัดการผลิตภัณฑ์)/.test(r);
  const hasRjYHint = /(รจญ\.?|รองกรรมการผู้จัดการใหญ่)/.test(r);
  if ((hasCorporateHint && hasFloorPrice) || (hasFloorPrice && hasPmWorkflowHint && hasRjYHint)) {
    return {
      approver: "รจญ.",
      note: "ต้องผ่านการพิจารณาจากฝ่ายบริหารจัดการผลิตภัณฑ์ (PM) ก่อนเสนออนุมัติ",
    };
  }
  if (
    /(ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร|นำรายการส่งเสริมการขายไปให้ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(r) &&
    /(pm|ผู้จัดการผลิตภัณฑ์)/.test(r)
  ) {
    return {
      approver: "รจญ.",
      note: "ต้องผ่านการพิจารณาจากฝ่ายบริหารจัดการผลิตภัณฑ์ (PM) ก่อนเสนออนุมัติ",
    };
  }
  return null;
};

const toCompactAuthorityReply = (question, reply) => {
  const rawReply = String(reply || "").trim();
  if (!rawReply) return rawReply;
  if (!isAuthorityDecisionQuery(question)) return rawReply;
  // ถ้าโมเดลตอบมาแบบละเอียดอยู่แล้ว (เช่น bullet/ลำดับขั้น) ไม่ต้องย่อ
  // เพื่อกันเคสกด "อธิบายเพิ่มเติม" แล้วคำตอบโดนทับเป็นเวอร์ชันสั้น
  const hasStructuredDetails =
    rawReply.split(/\r?\n/).length >= 4
    || /(?:^|\n)\s*[-*•]\s+/.test(rawReply)
    || /(?:^|\n)\s*\d+[.)]\s+/.test(rawReply);
  if (hasStructuredDetails) return rawReply;
  // Follow-up ที่ต้องการ "อธิบายเพิ่ม/ยกตัวอย่าง" ไม่ควรถูกย่อเป็น 2 บรรทัด
  // ไม่งั้นคำตอบละเอียดจะถูกทับด้วยรูปแบบ compact โดยไม่จำเป็น
  if (isAuthorityDetailFollowUpQuery(question)) return rawReply;

  // ให้เคส authority สำคัญ (เช่น NT Corporate เกิน Floor Price) ถูก normalize ตรงตามกติกาเสมอ
  // และ fallback จากข้อความตอบ เมื่อโมเดลตอบมาใกล้เคียงแต่รูปแบบไม่คงที่
  const override = getAuthorityOverrideFromQuestion(question) || getAuthorityOverrideFromReply(rawReply);
  if (override) {
    return `ผู้อนุมัติ: ${formatAuthorityRole(override.approver)}\nหมายเหตุ: ${override.note}`;
  }

  const normalizedLines = rawReply
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((line) => line && !/^รายละเอียด\s*:?$/i.test(line));
  if (normalizedLines.length === 0) return rawReply;

  const authorityPriority = [
    { re: /กจญ\.?/i, label: "กจญ." },
    { re: /กรรมการผู้จัดการใหญ่/i, label: "กจญ." },
    { re: /รจญ\.?/i, label: "รจญ." },
    { re: /รองกรรมการผู้จัดการใหญ่/i, label: "รจญ." },
    { re: /ชจญ\.?/i, label: "ชจญ." },
    { re: /ผู้ช่วยกรรมการผู้จัดการใหญ่/i, label: "ชจญ." },
  ];

  const authorityMatch = authorityPriority.find(({ re }) => normalizedLines.some((line) => re.test(line)));
  const approverLine = authorityMatch
    ? normalizedLines.find((line) => authorityMatch.re.test(line))
    : normalizedLines.find((line) =>
        /(ผู้อนุมัติ|อนุมัติโดย|อำนาจอนุมัติ|มีอำนาจ|กจญ\.?|กรรมการผู้จัดการใหญ่|รองกรรมการผู้จัดการใหญ่|ผู้ช่วยกรรมการผู้จัดการใหญ่)/i.test(line),
      ) || normalizedLines[0];

  let approverValue = approverLine
    .replace(/^(ผู้อนุมัติ|อำนาจอนุมัติ|ผู้รับผิดชอบ)\s*[:：]\s*/i, "")
    .replace(/^.*?(?:อนุมัติ(?:โดย|จาก)?|มีอำนาจ(?:อนุมัติ)?)(?:\s*[:：])?\s*/i, "")
    .trim();
  if (!approverValue) approverValue = approverLine;
  approverValue = approverValue.replace(/^เป็นผู้อนุมัติ\s*/i, "").trim();
  approverValue = formatAuthorityRole(approverValue);
  if (authorityMatch?.label && approverValue === approverLine) {
    approverValue = formatAuthorityRole(authorityMatch.label);
  }

  const noteLine = normalizedLines.find(
    (line) =>
      line !== approverLine &&
      /(ต้อง|ก่อน|ผ่าน|เสนอ|หมายเหตุ|เงื่อนไข|pm|ผู้จัดการผลิตภัณฑ์)/i.test(line),
  );

  let noteValue = (noteLine || "").replace(/^หมายเหตุ\s*[:：]\s*/i, "").trim();
  if (!noteValue && /(ต้อง|ก่อน|ผ่าน|เสนอ|pm|ผู้จัดการผลิตภัณฑ์)/i.test(approverLine)) {
    noteValue = approverLine;
  }

  const compactLines = [`ผู้อนุมัติ: ${approverValue}`];
  if (noteValue) compactLines.push(`หมายเหตุ: ${noteValue}`);
  return compactLines.join("\n");
};

const stripDocumentLeadIn = (reply) => {
  let text = String(reply || "").trim();
  if (!text) return text;
  const leadInPatterns = [
    /^\s*(?:คำตอบคือ\s*[:：]\s*)?(?:ตาม|จาก)\s*เอกสาร(?:ที่(?:ส่งมา|ให้มา|แนบมา|เลือก)|ประกอบ)?\s*(?:นี้|ดังกล่าว)?\s*[,:\-–—]?\s*/i,
    /^\s*(?:คำตอบคือ\s*[:：]\s*)?อ้างอิงจากเอกสาร\s*(?:ที่(?:ส่งมา|ให้มา|แนบมา|เลือก)|ประกอบ)?\s*(?:นี้|ดังกล่าว)?\s*[,:\-–—]?\s*/i,
    /^\s*(?:คำตอบคือ\s*[:：]\s*)?จากข้อมูลในเอกสาร\s*(?:ที่(?:ส่งมา|ให้มา|แนบมา|เลือก)|ประกอบ)?\s*(?:นี้|ดังกล่าว)?\s*[,:\-–—]?\s*/i,
  ];
  for (const pattern of leadInPatterns) {
    text = text.replace(pattern, "").trim();
  }
  return text;
};

const isLikelyFollowUp = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  // คำถามสรุปภาพรวมมักเป็นคำถามใหม่ ไม่ควรดึง history เก่ามากดทับคำตอบ
  if (/สรุปทั้งหมด|สรุปทั้งเอกสาร|เอกสารเกี่ยวกับอะไร|เนื้อหาโดยรวม|โดยรวมเป็นยังไง/.test(m)) {
    return false;
  }
  // คำขอ "อธิบายเพิ่ม/ดูรายละเอียด/ยกตัวอย่าง/แบบเป็นข้อ/จากคำตอบก่อนหน้า" ถือเป็น follow-up เสมอ
  if (isAuthorityDetailFollowUpQuery(message)) return true;
  // คำถามต่อเนื่องทั่วไปที่อ้างอิงคำถามเดิม/ขอข้อมูลเพิ่ม
  if (/(จากคำถามเดิม|จากที่ถาม|ที่ถามไป|เพิ่มเติม|รายละเอียดเพิ่ม|ขยายความ|แล้วถ้า|แล้วกรณี|ถ้าเกิน|กรณีที่เกิน|แล้วล่ะ|ต่อจาก)/.test(m)) return true;
  // คำถามต่อเนื่องเชิงเงื่อนไข/ตัวเลขสั้นๆ เช่น "ถ้า 70 วันได้มั้ย", "50 วันล่ะ", "แล้ว 30 วัน"
  if (/^(ถ้า|แล้ว|งั้น)\s*/.test(m) && m.length <= 40) return true;
  if (/(ล่ะ|ละ)\s*\??$/.test(m) && m.length <= 30) return true;
  const isShortConditional = m.length <= 30
    && /\d/.test(m)
    && /(ได้มั้ย|ได้ไหม|ได้ป่าว|ได้รึ|ล่ะ|ละ|มั้ย|ไหม|หรือไม่|รึเปล่า)/.test(m);
  if (isShortConditional) return true;
  // short / referential messages are often follow-ups
  if (m.length <= 14) {
    if (/(แล้ว|ต่อ|อีก|เพิ่ม|ทำไม|ยังไง|ยังงี้|อันไหน|อันนี้|ตรงนี้|เมื่อกี้|ข้างบน|ที่บอก|ตามนั้น)/.test(m)) return true;
  }
  const patterns = [
    /อธิบายเพิ่ม/,
    /ขยายความ/,
    /แล้วล่ะ/,
    /ต่อเลย/,
    /จากเมื่อกี้/,
    /เมื่อกี้/,
    /ตามที่บอก/,
    /อันนี้/,
    /ตรงนี้/,
    /ข้างบน/,
    /สรุปอีกที/,
    /หมายถึง/,
    /แบบไหนดีกว่า/,
    /อันไหนดีกว่า/,
    /ต่างกันยังไง/,
    /ดีกว่ายังไง/,
    /แบบไหนเร็วสุด/,
    /อันไหนเร็วสุด/,
    /ตัวไหนเร็วสุด/,
    /ไหนเร็วสุด/,
    /เร็วสุด/,
    /ช้าที่สุด/,
    /which\s+is\s+better/,
    /what'?s\s+better/,
    /which\s+is\s+fastest/,
    /fastest/,
  ];
  if (patterns.some((re) => re.test(m))) return true;

  // Generic follow-up heuristic:
  // ถ้าเป็นคำถามสั้นเชิงเปรียบเทียบ/อ้างอิง (แต่ไม่ self-contained) ให้ถือเป็นคำถามต่อเนื่อง
  // เพื่อลดการต้องเพิ่ม pattern ทีละเคส
  const hasReferentialCue = /(แบบไหน|อันไหน|ตัวไหน|ไหน|แบบนี้|แบบนั้น|อันนี้|อันนั้น|ตัวนี้|ตัวนั้น)/.test(m);
  const hasComparativeCue = /(ดีกว่า|เร็วกว่า|เร็วสุด|ช้าสุด|คุ้มกว่า|เหมาะกว่า|ต่างกัน|แตกต่าง|ควร|ไม่ควร|แนะนำ|เลือกอันไหนดี|เลือกแบบไหนดี)/.test(m);
  const hasStandaloneContext = /(ระหว่าง|เทียบ|vs|versus|กับ)/.test(m);
  const isShortQuestion = m.length <= 36;
  if (isShortQuestion && (hasReferentialCue || hasComparativeCue) && !hasStandaloneContext) {
    return true;
  }

  return false;
};

const SEARCH_STOPWORDS = new Set([
  "คือ", "ที่", "และ", "หรือ", "ของ", "ใน", "กับ", "ว่า", "อะไร", "อย่างไร", "ยังไง", "ทำไม", "ไหม", "มั้ย",
  "the", "is", "are", "what", "how", "why", "a", "an", "to", "for", "of", "and", "or", "in", "on",
]);

const extractEvidenceTokens = (message) => {
  const raw = String(message || "");
  const normalized = raw.toLowerCase();
  const words = normalized
    .split(/[^\p{L}\p{N}%./-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token));
  const numeric = raw.match(/\d+(?:[.,]\d+)?%?/g) || [];
  const unique = new Set(
    [...words, ...numeric.map((token) => token.replace(",", ".").trim())]
      .filter(Boolean),
  );
  return Array.from(unique).slice(0, 16);
};

const isPricingIntent = (message) => {
  const normalized = String(message || "").toLowerCase();
  return /(ราคา|ค่าบริการ|แพ็กเกจ|โปร|โปรโมชั่น|เท่าไหร่|กี่บาท|เดือนนี้|ต่อเดือน|\/เดือน)/.test(normalized);
};

const isConsumerInternetPriceQuery = (message) => {
  const normalized = normalizeText(message);
  return /(โปรเน็ตบ้าน|เน็ตบ้าน|internet home|home internet|fiber home)/.test(normalized);
};

const isUndergroundDarkFiberPriceQuery = (message) => {
  const normalized = normalizeText(message);
  return /(nt\s*dark\s*fiber|เส้นใยแก้วนำแสง|dark fiber)/.test(normalized)
    && /(ใต้ดิน|ร้อยสายใต้ดิน)/.test(normalized)
    && /(ราคา|ค่าบริการ|เท่าไหร่|ต่อเดือน|\/เดือน)/.test(normalized);
};

const getNoDataReply = (message) => {
  if (isConsumerInternetPriceQuery(message)) {
    return "ขออภัยครับ ไม่มีข้อมูลโปรเน็ตบ้านในเอกสารที่เลือก จึงไม่สามารถยืนยันราคาได้";
  }
  if (isUndergroundDarkFiberPriceQuery(message)) {
    return "ไม่มีข้อมูลในเอกสารสำหรับค่าบริการ NT Dark Fiber แบบร้อยสายใต้ดินต่อเดือน";
  }
  return NO_GROUNDING_REPLY;
};

const shouldForceNoDataReply = (message) => isUndergroundDarkFiberPriceQuery(message);

const isSystemCapabilityQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(มี(ข้อมูล|เอกสาร|ความรู้).*(อะไรบ้าง|บ้าง)|มีเอกสารอะไร.*(ระบบ|ถามได้)|ระบบมีอะไรบ้าง|ถามอะไรได้บ้าง|มีเรื่องอะไรให้ถาม|ช่วยอะไรได้บ้าง|มีหัวข้ออะไรบ้าง)/.test(m);
};

const isUnintelligibleQuery = (message) => {
  const raw = String(message || "");
  const trimmed = raw.trim();
  if (!trimmed) return true;
  // ถ้าเพี้ยนแค่นิดเดียว ให้ตอบได้ตามปกติ (ไม่บล็อก)
  if (trimmed.length <= 120) {
    const minorNoise = (trimmed.match(/[?\uFF1F\u061F�]/g) || []).length;
    if (minorNoise <= 3) return false;
  }
  // รองรับเครื่องหมายคำถามหลายแบบ (ASCII ?, fullwidth ？, Arabic ؟)
  const questionMarkCount = (trimmed.match(/[?\uFF1F\u061F]/g) || []).length;
  const questionMarkBursts = trimmed.match(/[?\uFF1F\u061F]{4,}/g) || [];
  const replacementCharCount = (trimmed.match(/�/g) || []).length;
  const weirdSymbolBursts = trimmed.match(/[^\p{L}\p{N}\s.,!?%:/()\-]{4,}/gu) || [];
  const meaningfulChars = (trimmed.match(/[\p{L}\p{N}]/gu) || []).length;
  const unknownSymbolCount = (trimmed.match(/[^\p{L}\p{N}\s.,!?%:/()\-]/gu) || []).length;
  const noiseRatio = (questionMarkCount + replacementCharCount + unknownSymbolCount) / Math.max(1, trimmed.length);
  // ยอมให้มีสะกดผิด/พิมพ์ตกเล็กน้อยได้: จะถือว่าอ่านไม่ออกเมื่อ noise หนักจริงเท่านั้น
  // กรณีคลาสสิก: เครื่องหมาย ? เยอะมาก + แทบไม่มีตัวอักษรที่มีความหมาย
  if (questionMarkCount >= 14 && meaningfulChars <= 6) return true;
  // มี replacement char มักเป็น encoding พัง: ให้เข้มเฉพาะเมื่อยาวพอและสัดส่วนสูง
  if (replacementCharCount >= 4 && (replacementCharCount / Math.max(1, trimmed.length)) >= 0.2) return true;
  // กรณีข้อความแบ่งเป็นก้อน ???? หลายช่วง แม้มี keyword อังกฤษคั่นอยู่เล็กน้อย
  if (questionMarkBursts.length >= 2 && questionMarkCount >= 10) return true;
  // อักขระแปลกอื่น ๆ ถ้าเป็นก้อนยาวหลายช่วง ก็ถือว่าอ่านไม่ออกเหมือนกัน
  if (weirdSymbolBursts.length >= 2 && unknownSymbolCount >= 10) return true;
  // ข้อความแทบเป็น noise ทั้งบรรทัด
  if (trimmed.length >= 20 && noiseRatio >= 0.55 && meaningfulChars <= 8) return true;
  // ข้อความสั้นแต่ไม่มีสาระพอให้อ่านความหมาย
  if (trimmed.length >= 10 && meaningfulChars <= 2 && noiseRatio >= 0.4) return true;
  return false;
};

const isComparativeAuthorityQuery = (message) => {
  const m = normalizeText(message);
  if (!isAuthorityDecisionQuery(m)) return false;
  const numericMentions = m.match(/\d+(?:[.,]\d+)?\s*%?/g) || [];
  return numericMentions.length >= 2 && /(ถ้า|และ|เทียบ|กรณี)/.test(m);
};

const getUnintelligibleReply = () => "ขออภัยครับ ข้อความที่ส่งมายังอ่านไม่ชัดเจน รบกวนพิมพ์ใหม่อีกครั้งให้ชัดเจนขึ้นครับ";

const getSystemCapabilityReply = (contextDocuments = []) => {
  const docs = (contextDocuments || [])
    .map((doc) => String(doc?.displayName || doc?.fileName || "").trim())
    .filter(Boolean);
  const uniqueDocs = Array.from(new Set(docs)).slice(0, 8);
  if (uniqueDocs.length === 0) {
    return "ตอนนี้ระบบตอบได้ตามเอกสารที่เลือกไว้ เช่น ค่าบริการ เงื่อนไขส่วนลด ผู้อนุมัติ และขั้นตอนที่ระบุในเอกสารครับ";
  }
  return `ระบบตอบได้ตามข้อมูลในเอกสารที่เลือกตอนนี้ เช่น:\n- ${uniqueDocs.join("\n- ")}\n\nถ้าต้องการ ผมสรุปหัวข้อสำคัญของแต่ละเอกสารให้ต่อได้ครับ`;
};

const hasSufficientGroundingEvidence = (message, groundingChunks) => {
  const chunks = Array.isArray(groundingChunks) ? groundingChunks : [];
  if (chunks.length === 0) return false;
  const tokens = extractEvidenceTokens(message);
  if (tokens.length === 0) return true;
  const contextText = chunks
    .slice(0, 4)
    .map((chunk) => String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? "").toLowerCase())
    .join("\n");
  if (!contextText.trim()) return false;
  const numericTokens = tokens.filter((token) => /^\d+(?:\.\d+)?%?$/.test(token));
  const textTokens = tokens.filter((token) => !/^\d+(?:\.\d+)?%?$/.test(token));
  const matchedNumeric = numericTokens.filter((token) => contextText.includes(token)).length;
  const matchedText = textTokens.filter((token) => contextText.includes(token)).length;
  const hasPriceSignalInContext = /(บาท|บ\.|\/เดือน|ต่อเดือน|ราคา|ค่าบริการ|\d{2,}(?:[.,]\d+)?)/.test(contextText);
  const hasAuthoritySignalInContext = /(ผู้อนุมัติ|อนุมัติ|อำนาจ|กจญ|รจญ|ชจญ|ผจก|pm|product\s*manager|super\s*product\s*manager)/.test(contextText);

  // คำถาม authority มักมีคำว่า Floor Price/เปอร์เซ็นต์ปนอยู่ แต่หลักฐานที่ต้องการคือสายอนุมัติ ไม่ใช่ราคา
  // จึงต้องไม่ใช้เกณฑ์ pricing-strict ที่บังคับสัญญาณราคา
  if (isAuthorityDecisionQuery(message)) {
    // ไม่บังคับ match ตัวเลข เพราะคำถามแนว authority มักใส่เงื่อนไขตัวเลขหลายแบบ
    // แต่ใจความที่ต้องตอบคือผู้อนุมัติ/สายอนุมัติ
    return matchedText >= 1 && hasAuthoritySignalInContext;
  }

  if (isPricingIntent(message)) {
    if (numericTokens.length > 0) {
      return matchedNumeric >= 1 && matchedText >= 2 && hasPriceSignalInContext;
    }
    return matchedText >= 2 && hasPriceSignalInContext;
  }
  // ถ้าคำถามมีตัวเลข/เปอร์เซ็นต์ ต้อง match อย่างน้อย 1 ตัวเลข + คำหลัก 1 คำ เพื่อกันหยิบบริบทผิดเรื่อง
  if (numericTokens.length > 0) {
    return matchedNumeric >= 1 && matchedText >= 1;
  }
  return matchedText >= 2;
};

const isOverviewStyleQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  const patterns = [
    /เอกสารเกี่ยวกับอะไร/,
    /เกี่ยวกับอะไร/,
    /สรุปให้/,
    /สรุป(ให้)?หน่อย/,
    /สรุปทั้งเอกสาร/,
    /ทั้งเอกสาร.*สรุป|สรุป.*ทั้งเอกสาร/,
    /มีอะไรบ้าง/,
    /เนื้อหาโดยรวม/,
    /โดยรวมเป็นยังไง/,
    /สรุปใจความ/,
    /overview|summary|summarize/,
  ];
  return patterns.some((re) => re.test(m));
};

const isApproverRolesQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(ผู้อนุมัติ.*แต่ละตำแหน่ง|แต่ละตำแหน่ง.*ผู้อนุมัติ|ผู้อนุมัติมีใครบ้าง|มีใครบ้าง.*ผู้อนุมัติ|รายชื่อตำแหน่งผู้อนุมัติ)/.test(m);
};

const collectApproverAbbreviations = (...texts) => {
  const merged = texts
    .map((t) => String(t || ""))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const found = new Set();
  // normalize known variants/typos to canonical abbreviations
  if (/(ผจก\.?|ผู้จัดการ)/i.test(merged)) found.add("ผจก.");
  if (/(ชจญ\.?|ชจรย\.?|ผู้ช่วยกรรมการผู้จัดการใหญ่)/i.test(merged)) found.add("ชจญ.");
  if (/(รจญ\.?|รองกรรมการผู้จัดการใหญ่)/i.test(merged)) found.add("รจญ.");
  if (/(กจญ\.?|กรรมการผู้จัดการใหญ่)/i.test(merged)) found.add("กจญ.");
  const order = ["ผจก.", "ชจญ.", "รจญ.", "กจญ."];
  return order.filter((abbr) => found.has(abbr));
};

const buildApproverRolesReply = (groundingChunks, contextText = "") => {
  const chunkTexts = Array.isArray(groundingChunks)
    ? groundingChunks.map((chunk) => String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? "")).filter(Boolean)
    : [];
  const approvers = collectApproverAbbreviations(...chunkTexts, contextText);
  if (approvers.length === 0) return "ผู้อนุมัติ: ไม่พบข้อมูลผู้อนุมัติที่ชัดเจนในบริบทที่ดึงได้";
  return `ผู้อนุมัติ: ${approvers.map((approver) => formatAuthorityRole(approver)).join(", ")}`;
};

const MAX_CONTEXT_CHARS_FOR_MODEL = Number(process.env.MAX_CONTEXT_CHARS_FOR_MODEL || 12000);
const NO_GROUNDING_REPLY = "ขออภัยครับ ยังไม่พบข้อมูลที่ตรงจากเอกสารที่เลือก จึงไม่สามารถยืนยันคำตอบได้";

conversationsRouter.post("/", authenticate, async (req, res) => {
  const { documentId, botId } = req.body ?? {};
  const isPrivate = req.body?.private === true;

  if (!documentId) {
    res.status(400).json({ error: "documentId is required" });
    return;
  }

  let document = await prisma.document.findFirst({
    where: {
      id: documentId,
      OR: [
        { ownerId: req.user.id },
        { shares: { some: { userId: req.user.id } } },
      ],
    },
  });
  if (!document) {
    const helpDoc = await prisma.document.findFirst({
      where: { id: documentId, displayName: "คู่มือการใช้งาน" },
    });
    if (helpDoc) document = helpDoc;
  }
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  let bot = null;
  if (botId) {
    bot = await prisma.bot.findFirst({
      where: {
        id: botId,
        OR: [
          { ownerId: req.user.id },
          { name: "บอทช่วยสอน" },
          { name: "Enterprise AI Chatbot Assistant" },
        ],
      },
    });
    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }
  }

  const conversation = await prisma.conversation.create({
    data: {
      documentId,
      userId: req.user.id,
      botId: bot?.id ?? undefined,
      private: isPrivate,
    },
  });

  res.status(201).json(conversation);
  await invalidateConversationCaches(conversation.id, req.user.id);
});

conversationsRouter.get("/", authenticate, async (req, res) => {
  const cacheKey = userCacheKey("conversations", req.user.id);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      document: { select: { id: true, displayName: true } },
      bot: { select: { id: true, name: true } },
      messages: {
        select: { content: true, role: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const payload = conversations.map((conversation) => ({
    id: conversation.id,
    title: resolveConversationTitle(conversation.title, conversation.messages[0]?.content),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    private: conversation.private === true,
    document: conversation.document,
    bot: conversation.bot,
    lastMessage: sanitizeRedactedContentForClient(conversation.messages[0]?.content) ?? null,
  }));
  res.json(payload);
  await cacheSet(cacheKey, payload);
});

conversationsRouter.delete("/", authenticate, async (req, res) => {
  await prisma.conversation.deleteMany({
    where: { userId: req.user.id },
  });
  res.json({ ok: true });
  await cacheDel(userCacheKey("conversations", req.user.id));
});

conversationsRouter.delete("/:id", authenticate, async (req, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await prisma.conversation.delete({ where: { id: conversation.id } });
  res.json({ ok: true });
  await invalidateConversationCaches(conversation.id, req.user.id);
});

conversationsRouter.get("/:id/messages", authenticate, async (req, res) => {
  const conversationId = req.params.id;
  const rawLimit = Number(req.query.limit || 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: req.user.id },
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const cacheKey = conversationMessagesKey(conversationId, limit);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      feedbacks: {
        where: { userId: req.user.id },
        select: { rating: true },
      },
    },
  });

  const payload = messages
    .reverse()
    .map(({ feedbacks, ...message }) => ({
      ...message,
      content: sanitizeRedactedContentForClient(message.content),
      feedback: feedbacks?.[0]?.rating ?? null,
    }));
  res.json(payload);
  await cacheSet(cacheKey, payload);
});

/** นำ groundingChunks จาก message (JSON/object) ไปใช้แก้ chunk ใน vector DB ตาม correction { from, to } */
async function applyCorrectionToKnowledge(message, correction) {
  const fromStr = String(correction?.from ?? "").trim();
  const toStr = String(correction?.to ?? "").trim();
  if (!fromStr) return 0;
  let chunks = message.groundingChunks;
  if (!chunks) return 0;
  if (typeof chunks === "string") {
    try {
      chunks = JSON.parse(chunks);
    } catch {
      return 0;
    }
  }
  if (!Array.isArray(chunks)) return 0;
  let applied = 0;
  for (const chunk of chunks) {
    const text = chunk?.payload?.text ?? chunk?.retrievedContext?.text ?? "";
    if (typeof text !== "string") continue;
    const replaced = replaceTextFlexible(text, fromStr, toStr);
    if (!replaced.changed) continue;
    const newText = replaced.text;
    const docId = chunk?.payload?.docId ?? chunk?.retrievedContext?.docId;
    const chunkIndex = chunk?.payload?.chunkIndex;
    const fileName = chunk?.payload?.fileName ?? chunk?.retrievedContext?.title;
    if (!docId) continue;
    try {
      const result = await updateChunkText({
        docId,
        chunkIndex: chunkIndex != null ? Number(chunkIndex) : 0,
        fileName: fileName != null ? String(fileName) : undefined,
        newText,
      });
      if (result.updated) applied += 1;
    } catch (err) {
      console.warn("[applyCorrectionToKnowledge] updateChunkText failed:", err);
    }
  }
  return applied;
}

/** อัปเดต Qdrant ทั้งเอกสาร: สแกนทุก chunk ของ docId แล้วแทนที่ fromStr → toStr ใน payload.text และ re-embed */
async function applyCorrectionToVectorDb(documentIds, correction) {
  const fromStr = String(correction?.from ?? "").trim();
  const toStr = String(correction?.to ?? "").trim();
  if (!fromStr || !documentIds?.length) return 0;
  let total = 0;
  for (const docId of documentIds) {
    if (!docId) continue;
    try {
      const n = await replaceTextInDocument({ docId, fromStr, toStr });
      total += n;
    } catch (err) {
      console.warn("[applyCorrectionToVectorDb] replaceTextInDocument failed for docId:", docId, err);
    }
  }
  return total;
}

const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeForMatch = (value) => String(value || "").replace(/\s+/g, " ").trim();
const buildLooseWhitespaceRegex = (fromStr) => {
  const normalized = normalizeForMatch(fromStr);
  if (!normalized) return null;
  const pattern = normalized
    .split(/\s+/)
    .map((token) => escapeRegExp(token))
    .join("\\s+");
  return new RegExp(pattern, "g");
};

const replaceTextFlexible = (text, fromStr, toStr) => {
  if (typeof text !== "string" || !text) return { changed: false, text };
  const from = String(fromStr || "");
  const to = String(toStr || "");
  if (!from.trim()) return { changed: false, text };
  if (text.includes(from)) {
    const next = text.split(from).join(to);
    return { changed: next !== text, text: next };
  }
  const re = buildLooseWhitespaceRegex(from);
  if (!re) return { changed: false, text };
  const next = text.replace(re, to);
  return { changed: next !== text, text: next };
};

/** fallback: แก้ข้อความใน sourceFiles ของเอกสารแล้ว reindex ใหม่ เพื่อให้คำถามรอบถัดไปใช้ค่าที่แก้ */
async function applyCorrectionToDocumentSourceFiles(documentIds, correction) {
  const fromStr = String(correction?.from ?? "").trim();
  const toStr = String(correction?.to ?? "");
  if (!fromStr || !documentIds?.length) return 0;
  let updatedCount = 0;

  for (const docId of documentIds) {
    if (!docId) continue;
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true, ownerId: true, sourceFiles: true },
    });
    if (!doc) continue;
    const files = Array.isArray(doc.sourceFiles) ? doc.sourceFiles : [];
    let docChanged = false;

    const nextFiles = files.map((file) => {
      if (!file || typeof file !== "object") return file;
      const nextFile = { ...file };

      if (typeof nextFile.text === "string") {
        const replaced = replaceTextFlexible(nextFile.text, fromStr, toStr);
        if (replaced.changed) {
          nextFile.text = replaced.text;
          docChanged = true;
          updatedCount += 1;
        }
      }

      if (Array.isArray(nextFile.blocks)) {
        nextFile.blocks = nextFile.blocks.map((block) => {
          if (!block || typeof block !== "object") return block;
          const text = typeof block.text === "string" ? block.text : "";
          const replaced = replaceTextFlexible(text, fromStr, toStr);
          if (!replaced.changed) return block;
          docChanged = true;
          updatedCount += 1;
          return { ...block, text: replaced.text };
        });
      }

      return nextFile;
    });

    if (!docChanged) continue;
    await prisma.document.update({
      where: { id: doc.id },
      data: { sourceFiles: nextFiles },
    });

    // ให้ vector DB ตาม sourceFiles ล่าสุดเสมอ
    const preparedFiles = ensureSourceFileBlocks(nextFiles);
    await deleteDocumentVectors(doc.id).catch(() => null);
    await indexDocumentChunks({
      documentId: doc.id,
      userId: doc.ownerId,
      sourceFiles: preparedFiles,
    }).catch((err) => {
      console.warn("[applyCorrectionToDocumentSourceFiles] reindex failed:", err?.message || err);
    });
  }

  return updatedCount;
}

/** PATCH/PUT ข้อความในแชท — แก้เฉพาะข้อความบอท (role=model), เจ้าของแชทเท่านั้น, บันทึกลง DB; ถ้ามี correction ให้อัปเดต chunk ใน vector DB ด้วย */
conversationsRouter.patch("/:id/messages/:messageId", authenticate, async (req, res) => {
  const conversationId = req.params.id;
  const messageId = req.params.messageId;
  const content = req.body?.content ?? req.body?.message;
  const correction = req.body?.correction;

  if (typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content or message is required" });
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: req.user.id },
    include: {
      document: { select: { id: true } },
      bot: { include: { documents: { include: { document: { select: { id: true } } } } } },
    },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId: conversation.id },
  });
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (message.role !== "model") {
    res.status(400).json({ error: "Only bot (model) messages can be edited" });
    return;
  }

  const trimmed = content.trim().slice(0, 50000);
  let appliedToKnowledge = 0;
  if (correction && typeof correction === "object" && (correction.from != null || correction.to != null)) {
    const docIds = conversation.bot?.documents?.map((d) => d.document?.id).filter(Boolean) ||
      (conversation.documentId ? [conversation.documentId] : []);
    appliedToKnowledge = await applyCorrectionToVectorDb(docIds, {
      from: correction.from ?? "",
      to: correction.to ?? "",
    });
    if (appliedToKnowledge === 0) {
      appliedToKnowledge = await applyCorrectionToKnowledge(message, {
        from: correction.from ?? "",
        to: correction.to ?? "",
      });
    }
    if (appliedToKnowledge === 0) {
      appliedToKnowledge = await applyCorrectionToDocumentSourceFiles(docIds, {
        from: correction.from ?? "",
        to: correction.to ?? "",
      });
    }
    docIds.forEach((id) => invalidateRagCacheForDocument(id));
    invalidateAllRagCache();
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { content: trimmed },
  });

  await invalidateConversationCaches(conversation.id, req.user.id);
  res.json({ ...updated, appliedToKnowledge });
});

conversationsRouter.put("/:id/messages/:messageId", authenticate, async (req, res) => {
  const conversationId = req.params.id;
  const messageId = req.params.messageId;
  const content = req.body?.content ?? req.body?.message;
  const correction = req.body?.correction;

  if (typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content or message is required" });
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: req.user.id },
    include: {
      document: { select: { id: true } },
      bot: { include: { documents: { include: { document: { select: { id: true } } } } } },
    },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId: conversation.id },
  });
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (message.role !== "model") {
    res.status(400).json({ error: "Only bot (model) messages can be edited" });
    return;
  }

  const trimmed = content.trim().slice(0, 50000);
  let appliedToKnowledge = 0;
  if (correction && typeof correction === "object" && (correction.from != null || correction.to != null)) {
    const docIds = conversation.bot?.documents?.map((d) => d.document?.id).filter(Boolean) ||
      (conversation.documentId ? [conversation.documentId] : []);
    appliedToKnowledge = await applyCorrectionToVectorDb(docIds, {
      from: correction.from ?? "",
      to: correction.to ?? "",
    });
    if (appliedToKnowledge === 0) {
      appliedToKnowledge = await applyCorrectionToKnowledge(message, {
        from: correction.from ?? "",
        to: correction.to ?? "",
      });
    }
    if (appliedToKnowledge === 0) {
      appliedToKnowledge = await applyCorrectionToDocumentSourceFiles(docIds, {
        from: correction.from ?? "",
        to: correction.to ?? "",
      });
    }
    docIds.forEach((id) => invalidateRagCacheForDocument(id));
    invalidateAllRagCache();
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { content: trimmed },
  });

  await invalidateConversationCaches(conversation.id, req.user.id);
  res.json({ ...updated, appliedToKnowledge });
});

conversationsRouter.get("/:id", authenticate, async (req, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: {
      document: { select: { id: true, displayName: true } },
      bot: { select: { id: true, name: true } },
      messages: {
        select: { content: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json({
    id: conversation.id,
    title: resolveConversationTitle(conversation.title, conversation.messages[0]?.content),
    botId: conversation.botId,
    documentId: conversation.documentId,
    private: conversation.private === true,
    document: conversation.document,
    bot: conversation.bot,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  });
});

conversationsRouter.patch("/:id", authenticate, async (req, res) => {
  const { title } = req.body ?? {};
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { title: typeof title === "string" ? title.trim().slice(0, 255) : undefined },
  });
  res.json(updated);
  await invalidateConversationCaches(conversation.id, req.user.id);
});

messagesRouter.post("/", authenticate, async (req, res) => {
  const { conversationId, role, content, groundingChunks } = req.body ?? {};

  if (!conversationId || !role || !content) {
    res.status(400).json({ error: "conversationId, role and content are required" });
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: req.user.id },
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      userId: role === "user" ? req.user.id : undefined,
      role,
      content,
      groundingChunks: groundingChunks ?? undefined,
      platform: getPlatform(req),
    },
  });

  const updates = { updatedAt: new Date() };
  if (!conversation.title && role === "user") {
    updates.title = content.trim().slice(0, 80);
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: updates,
  });

  res.status(201).json(message);
  await invalidateConversationCaches(conversation.id, req.user.id);
});

messagesRouter.post("/:id/feedback", authenticate, async (req, res) => {
  const { rating, comment } = req.body ?? {};
  const normalizedRating = String(rating || "").toLowerCase();
  const isClear = ["none", "clear", "off"].includes(normalizedRating);
  if (!isClear && !["up", "down"].includes(normalizedRating)) {
    res.status(400).json({ error: "rating must be up, down, or none" });
    return;
  }

  const message = await prisma.message.findFirst({
    where: {
      id: req.params.id,
      conversation: { userId: req.user.id },
    },
  });
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (message.role !== "model") {
    res.status(400).json({ error: "Feedback is only allowed for model messages" });
    return;
  }

  // กดซ้ำ = ยกเลิก feedback (ลบทิ้ง)
  if (isClear) {
    await prisma.messageFeedback.deleteMany({
      where: { messageId: message.id, userId: req.user.id },
    });
    res.json({ ok: true, rating: null });
    return;
  }

  const sanitizedComment = typeof comment === "string" && comment.trim() ? comment.trim().slice(0, 500) : null;
  const feedback = await prisma.messageFeedback.upsert({
    where: {
      messageId_userId: { messageId: message.id, userId: req.user.id },
    },
    update: { rating: normalizedRating, comment: sanitizedComment },
    create: { messageId: message.id, userId: req.user.id, rating: normalizedRating, comment: sanitizedComment },
  });

  res.json({ ok: true, rating: feedback.rating });
});

/** GET /api/chat/:conversationId/debug-context?message=... — ช่วยดีบักว่าแชทดึง context อะไรมาตอบ */
chatRouter.get("/:conversationId/debug-context", authenticate, async (req, res) => {
  const conversationId = String(req.params.conversationId || "").trim();
  const message = String(req.query.message || "").trim();
  if (!conversationId || !message) {
    res.status(400).json({ error: "conversationId and message are required" });
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: req.user.id },
    include: {
      document: true,
      bot: {
        include: {
          documents: {
            include: { document: true },
          },
        },
      },
    },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const botDocIds = conversation.bot?.documents?.map((l) => l.document?.id).filter(Boolean);
  // Global retrieval scope: ห้องแชทมีไว้จัดระเบียบ ไม่จำกัดเอกสารที่ใช้ค้นหา
  const documentIds =
    botDocIds && botDocIds.length > 0
      ? Array.from(new Set(botDocIds.map(String)))
      : [conversation.document.id];
  const rawContextDocs =
    botDocIds && botDocIds.length > 0
      ? conversation.bot?.documents?.map((l) => l.document).filter(Boolean)
      : [conversation.document];
  const contextDocuments = filterContextDocsByIds(rawContextDocs, documentIds);

  let groundingChunks = await retrieveGroundingChunks(documentIds, message);
  if (groundingChunks.length === 0) {
    const keywordFallbackChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 5);
    if (keywordFallbackChunks.length > 0) groundingChunks = keywordFallbackChunks;
  } else {
    // Hybrid search: เสริมผล keyword (เลขที่/ราคา/มาตรา ที่ vector อาจพลาด) แล้ว dedupe คงลำดับ vector ก่อน
    const keywordChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 4);
    if (keywordChunks.length > 0) {
      groundingChunks = mergeHybridChunks(groundingChunks, keywordChunks, Math.max(Number(MAX_CONTEXT_PIECES) || 12, groundingChunks.length));
    }
  }
  const contextPieces = buildContextPiecesWithNeighbors(groundingChunks, contextDocuments, message, {
    maxPieces: hasMultipleQuestions(message)
      ? Math.min((Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 12) * 2, 28)
      : (Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 12),
    neighborWindow: Number.isFinite(CONTEXT_NEIGHBOR_WINDOW) ? CONTEXT_NEIGHBOR_WINDOW : 0,
  });

  let usedFallback = false;
  let contextText = contextPieces.join("\n\n---\n\n");
  if (!contextText && contextDocuments.length > 0) {
    contextText = getFallbackContextFromDocuments(contextDocuments);
    usedFallback = Boolean(contextText);
  }

  const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
  const chunkPreview = groundingChunks.map((chunk, index) => ({
    rank: index + 1,
    score: chunk?.score ?? null,
    docId: chunk?.retrievedContext?.docId ?? chunk?.payload?.docId ?? null,
    title: chunk?.retrievedContext?.title ?? chunk?.payload?.fileName ?? null,
    chunkIndex: chunk?.payload?.chunkIndex ?? null,
    textPreview: String(chunk?.retrievedContext?.text || "").slice(0, 240),
  }));

  res.json({
    ok: true,
    conversationId,
    query: message,
    bot: conversation.bot ? { id: conversation.bot.id, name: conversation.bot.name } : null,
    documentIds,
    groundingCount: groundingChunks.length,
    contextPieceCount: contextPieces.length,
    contextChars: contextText.length,
    usedFallback,
    references,
    groundingChunks: chunkPreview,
    contextPieces,
  });
});

/** POST /api/chat/stream — streaming response (SSE) */
chatRouter.post("/stream", authenticate, async (req, res) => {
  const { conversationId, message } = req.body ?? {};

  if (!conversationId || !message) {
    res.status(400).json({ error: "conversationId and message are required" });
    return;
  }
  // โหมดส่วนตัว: เคารพสวิตช์ที่ client ส่งมา (true/false); ถ้าไม่ส่ง (undefined) จะ fallback เป็น conversation.private
  const bodyPrivateMode = typeof req.body?.privateMode === "boolean" ? req.body.privateMode : undefined;
  const bodyPrivateContent = typeof req.body?.privateContent === "string" ? req.body.privateContent.trim() : "";
  // ไม่ใช้ rate limit ต่อนาที สำหรับแชท — ใช้แค่โควต้ารายวัน (MAX_DAILY_CHAT_MESSAGES / FREE_DAILY_TOKEN_LIMIT)
  const usage = await getOrCreateUsageDaily(req.user.id);
  if (usage.chatCount >= MAX_DAILY_CHAT_MESSAGES) {
    res.status(429).json({ error: "Daily chat quota exceeded" });
    return;
  }
  if (FREE_DAILY_TOKEN_LIMIT > 0 && getUsedTokensFromRow(usage) >= FREE_DAILY_TOKEN_LIMIT) {
    res.status(429).json({ error: "Daily token quota exceeded" });
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: req.user.id },
    include: {
      document: true,
      bot: {
        include: {
          documents: { include: { document: true } },
        },
      },
    },
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // โหมดส่วนตัว: เคารพสวิตช์จาก client ถ้าส่งมา; ไม่งั้นใช้สถานะห้อง (conversation.private)
  const privateMode = typeof bodyPrivateMode === "boolean" ? bodyPrivateMode : conversation.private === true;
  let privateInstructions = "";
  let privateKnowledge = "";
  let privateMemory = "";
  if (privateMode) {
    const parts = await loadPrivateContextParts(req.user.id);
    privateInstructions = parts.instructions;
    privateKnowledge = parts.knowledge;
    privateMemory = await loadCrossChatMemory(req.user.id, conversationId);
  }
  const hasPrivateContext = !!(privateInstructions || privateKnowledge || privateMemory);

  if (isUnintelligibleQuery(message)) {
    const fallbackReply = getUnintelligibleReply();
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: { conversationId, role: "model", content: fallbackReply, platform: getPlatform(req) },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: fallbackReply,
        references: [],
        groundingChunks: [],
      })}\n\n`,
    );
    res.end();
    return;
  }

  const privacyWarning = buildPersonalInfoWarning(message);
  if (privacyWarning) {
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: { conversationId, role: "model", content: privacyWarning, platform: getPlatform(req) },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ content: privacyWarning })}\n\n`);
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: privacyWarning,
        references: [],
        groundingChunks: [],
      })}\n\n`,
    );
    res.end();
    return;
  }

  if (isGreetingOnly(message)) {
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: { conversationId, role: "model", content: GREETING_REPLY, platform: getPlatform(req) },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ content: GREETING_REPLY })}\n\n`);
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: GREETING_REPLY,
        references: [],
        groundingChunks: [],
      })}\n\n`,
    );
    res.end();
    return;
  }
  if (shouldForceNoDataReply(message)) {
    const fallbackReply = getNoDataReply(message);
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: { conversationId, role: "model", content: fallbackReply, platform: getPlatform(req) },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: fallbackReply,
        references: [],
        groundingChunks: [],
      })}\n\n`,
    );
    res.end();
    return;
  }

  const botDocIds = conversation.bot?.documents?.map((l) => l.document?.id).filter(Boolean);
  const defaultDocumentIds =
    botDocIds && botDocIds.length > 0
      ? Array.from(new Set(botDocIds.map(String)))
      : [conversation.document.id];
  const rawContextDocs = botDocIds?.length
    ? conversation.bot?.documents?.map((l) => l.document).filter(Boolean)
    : [conversation.document];
  if (isSystemCapabilityQuery(message)) {
    const capabilityReply = getSystemCapabilityReply(rawContextDocs);
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: { conversationId, role: "model", content: capabilityReply, platform: getPlatform(req) },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: capabilityReply,
        references: [],
        groundingChunks: [],
      })}\n\n`,
    );
    res.end();
    return;
  }
  const { primaryDocumentIds, secondaryDocumentIds } = resolveRetrievalTargets(
    message,
    rawContextDocs,
    defaultDocumentIds,
  );
  const retrievalQuery = await buildStandaloneQuery(message, conversationId);
  let { groundingChunks, retrievalDocumentIds } = await resolveGroundingChunks({
    message,
    conversationId,
    retrievalQuery,
    primaryDocumentIds,
    secondaryDocumentIds,
    fast: req.body?.mode === "fast",
  });
  const contextDocuments = filterContextDocsByIds(rawContextDocs, retrievalDocumentIds);
  if (groundingChunks.length === 0) {
    const keywordFallbackChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 5);
    if (keywordFallbackChunks.length > 0) groundingChunks = keywordFallbackChunks;
  } else {
    // Hybrid search: เสริมผล keyword (เลขที่/ราคา/มาตรา ที่ vector อาจพลาด) แล้ว dedupe คงลำดับ vector ก่อน
    const keywordChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 4);
    if (keywordChunks.length > 0) {
      groundingChunks = mergeHybridChunks(groundingChunks, keywordChunks, Math.max(Number(MAX_CONTEXT_PIECES) || 12, groundingChunks.length));
    }
  }
  const contextPieces = buildContextPiecesWithNeighbors(groundingChunks, contextDocuments, message, {
    maxPieces: hasMultipleQuestions(message)
      ? Math.min((Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 12) * 2, 28)
      : (Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 12),
    neighborWindow: Number.isFinite(CONTEXT_NEIGHBOR_WINDOW) ? CONTEXT_NEIGHBOR_WINDOW : 0,
  });
  let contextText = contextPieces.join("\n\n---\n\n");
  // โหมดหลายคำถาม: ประกอบ context ใหม่แบบแยกบล็อกต่อข้อ (sectioned) กันข้อมูล/เลขคำสั่งแต่ละข้อปนกันจนโมเดลสับสน
  if (hasMultipleQuestions(message)) {
    try {
      const sectionedGroups = await retrieveGroundingGroups(retrievalDocumentIds, retrievalQuery, { fast: false });
      const sectionedContext = buildSectionedContext(sectionedGroups);
      if (sectionedContext) contextText = sectionedContext;
    } catch (_) {}
  }
  const isHelpBot = conversation.bot?.name === HELP_BOT_NAME;
  const overviewRequest = !isHelpBot && isOverviewStyleQuery(message);
  const followUpIntent = isLikelyFollowUp(message);
  if (!contextText && contextDocuments.length > 0 && overviewRequest) {
    contextText = getFallbackContextFromDocuments(contextDocuments);
  }
  if (contextText && contextText.length > MAX_CONTEXT_CHARS_FOR_MODEL) {
    contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS_FOR_MODEL)}\n\n[context truncated]`;
  }
  const ntPricingReply = await getNtCorpInternetPricingReply(message);
  const deterministicReply = ntPricingReply || (deterministicRulesEnabled ? getDeterministicRuleReply(message) : null);
  const deterministicMultiQuestion = Boolean(deterministicReply) && !ntPricingReply && hasMultipleQuestions(message);
  if (deterministicReply && !deterministicMultiQuestion) {
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: deterministicReply,
        groundingChunks: groundingChunks ?? undefined,
        references: references.length > 0 ? references : undefined,
        platform: getPlatform(req),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    // พ่นคำตอบจากเครื่องคำนวณ (deterministic) แบบ stream ให้ทยอยขึ้นเหมือนคำตอบ LLM
    // ปิด Nagle + flush ทุก chunk เพื่อกันไม่ให้ TCP รวม chunk เล็กๆ ส่งทีเดียว (จะได้เห็นทยอยพิมพ์จริง)
    try { res.socket?.setNoDelay?.(true); } catch (_) {}
    const detSleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const DET_CHUNK = 4;
    for (let i = 0; i < deterministicReply.length; i += DET_CHUNK) {
      res.write(`data: ${JSON.stringify({ content: deterministicReply.slice(i, i + DET_CHUNK) })}\n\n`);
      if (typeof res.flush === "function") res.flush();
      await detSleep(22);
    }
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: deterministicReply,
        references,
        groundingChunks: groundingChunks ?? [],
      })}\n\n`,
    );
    res.end();
    return;
  }
  const hasEvidence = hasSufficientGroundingEvidence(message, groundingChunks);
  const rejectNoGrounding = !isHelpBot && !overviewRequest && !isGreeting(message)
    && !followUpIntent
    && !deterministicReply
    && !hasPrivateContext
    && (groundingChunks.length === 0 || !hasEvidence);
  if (rejectNoGrounding) {
    const fallbackReply = getNoDataReply(message);
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: { conversationId, role: "model", content: fallbackReply, platform: getPlatform(req) },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: fallbackReply,
        references: [],
        groundingChunks: [],
      })}\n\n`,
    );
    res.end();
    return;
  }
  if (deterministicRulesEnabled && isApproverRolesQuery(message)) {
    const reply = buildApproverRolesReply(groundingChunks, contextText);
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: reply,
        groundingChunks: groundingChunks ?? undefined,
        references: references.length > 0 ? references : undefined,
        platform: getPlatform(req),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply,
        references,
        groundingChunks: groundingChunks ?? [],
      })}\n\n`,
    );
    res.end();
    return;
  }
  const policyPrompt = buildPolicyPrompt({ isHelpBot, message, overviewRequest, analytical: false });
  const systemParts = [policyPrompt];
  if (conversation.bot?.prompt?.trim()) systemParts.push(`คำสั่งเพิ่มเติม:\n${conversation.bot.prompt.trim()}`);
  if (hasPrivateContext) {
    systemParts.push(
      "โหมดส่วนตัว: ผู้ใช้ได้ตั้งค่าส่วนตัวไว้ (อาจมี 'คำสั่งจากผู้ใช้', 'ข้อมูล/ความรู้ส่วนตัว' และ 'บทสนทนาก่อนหน้า'). ให้ทำตามคำสั่งของผู้ใช้อย่างเคร่งครัด, ใช้ข้อมูลส่วนตัวและความจำก่อนหน้าตอบได้เต็มที่ร่วมกับ Context จากเอกสารระบบ, ห้ามตอบว่าไม่พบข้อมูลถ้าตอบได้จากส่วนเหล่านี้, และเมื่อข้อมูลส่วนตัวขัดกับเอกสารระบบให้ระบุที่มาทั้งสองฝั่งอย่างชัดเจน.",
    );
  }
  const systemPrompt = systemParts.filter(Boolean).join("\n\n");

  const historyLimit = Math.max(0, Number.isFinite(MAX_CHAT_HISTORY_MESSAGES) ? MAX_CHAT_HISTORY_MESSAGES : 20);
  const shouldUseHistory = followUpIntent;
  const scopedHistoryLimit = shouldUseHistory ? Math.min(historyLimit, 4) : 0;
  const historyRows = scopedHistoryLimit > 0
    ? await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: scopedHistoryLimit,
        select: { role: true, content: true },
      })
    : [];
  const historyMessages = historyRows
    .reverse()
    .map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: String(m.content ?? "").trim() }))
    .filter((m) => m.content.length > 0);
  const contextLabel = isHelpBot ? "Context (from user guide)" : "Context";
  const messages = [
    { role: "system", content: systemPrompt },
    ...(contextText ? [{ role: "system", content: `${contextLabel}:\n${contextText}` }] : []),
    ...buildPrivateSystemMessages({ instructions: privateInstructions, knowledge: privateKnowledge, memory: privateMemory }),
    ...(deterministicReply
      ? [{
          role: "system",
          content: `ข้อมูลที่ยืนยันแล้ว (authoritative): สำหรับส่วนของคำถามที่ตรงกับข้อมูลนี้ ให้ใช้ข้อความนี้ตรงตัว ห้ามแก้ตัวเลขหรือถ้อยคำ และต้องตอบส่วนอื่นของคำถามให้ครบด้วย:\n${deterministicReply}`,
        }]
      : []),
    ...(isComparativeAuthorityQuery(message)
      ? [{
          role: "system",
          content: "คำถามนี้เป็นการเปรียบเทียบหลายกรณี ให้ตอบแยกทีละกรณีตามเงื่อนไขตัวเลขในคำถาม และถ้าข้อมูลไม่ครบให้ระบุว่ากรณีใดไม่พบหลักฐาน",
        }]
      : []),
    ...historyMessages,
    { role: "user", content: message },
  ];

  try {
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });

    const streamBody = await callOpenAiGatewayStream(messages, undefined, req.body?.mode === "fast" ? "fast" : undefined);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let fullReply = "";
    let finalUsage = null;
    const reader = streamBody.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const sendEvent = (obj) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw);
              const content = parsed?.choices?.[0]?.delta?.content;
              if (typeof content === "string") {
                fullReply += content;
                sendEvent({ content });
              }
              if (parsed?.usage) {
                finalUsage = parsed.usage;
              }
            } catch (_) {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    let replyToSave = fullReply.trim() || "Sorry, I could not generate a response.";
    const suggestionsMatch = replyToSave.match(/\n\s*SUGGESTIONS\s*:\s*\n([\s\S]*)/i);
    if (suggestionsMatch) {
      replyToSave = replyToSave.slice(0, suggestionsMatch.index).trim();
    }

    replyToSave = stripDocumentLeadIn(replyToSave);
    replyToSave = stripRedundantShortSummary(replyToSave);
    replyToSave = toCompactAuthorityReply(message, replyToSave);

    const references = buildReferencesForReply({
      groundingChunks,
      contextDocuments,
      primaryDocument: conversation.document,
      message,
      hasPrivateContext,
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: replyToSave,
        groundingChunks: groundingChunks ?? undefined,
        references: references.length > 0 ? references : undefined,
        platform: getPlatform(req),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    const tokenUsage = getTokenUsage({ usage: finalUsage || {} });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: {
        chatCount: { increment: 1 },
        ...(tokenUsage.promptTokens || tokenUsage.completionTokens || tokenUsage.totalTokens
          ? {
              promptTokens: { increment: tokenUsage.promptTokens },
              completionTokens: { increment: tokenUsage.completionTokens },
              totalTokens: { increment: tokenUsage.totalTokens },
            }
          : {}),
      },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);

    sendEvent({
      done: true,
      messageId: modelMessage.id,
      reply: replyToSave,
      references,
      groundingChunks: groundingChunks ?? [],
    });
    res.end();
  } catch (error) {
    console.error("Chat stream failed", error);
    let msg = error instanceof Error ? error.message : "Chat failed";
    const isTimeout = /timed out|timeout/i.test(String(msg || ""));
    if (isTimeout && Array.isArray(groundingChunks) && groundingChunks.length > 0) {
      const references = buildReferencesForReply({
        groundingChunks,
        contextDocuments,
        primaryDocument: conversation.document,
        message,
        hasPrivateContext,
      });
      const snippets = groundingChunks
        .map((chunk) => String(chunk?.retrievedContext?.text ?? chunk?.payload?.text ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 2)
        .map((text) => (text.length > 240 ? `${text.slice(0, 240)}...` : text));
      const fallbackReply = snippets.length > 0
        ? `พบข้อมูลที่เกี่ยวข้องจากเอกสาร:\n- ${snippets.join("\n- ")}\n\nหมายเหตุ: ระบบสรุปคำตอบไม่ทันเวลา จึงแสดงข้อความที่เกี่ยวข้องจากเอกสารโดยตรง`
        : NO_GROUNDING_REPLY;
      const modelMessage = await prisma.message.create({
        data: {
          conversationId,
          role: "model",
          content: fallbackReply,
          groundingChunks: groundingChunks ?? undefined,
          references: references.length > 0 ? references : undefined,
          platform: getPlatform(req),
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
      });
      await prisma.usageDaily.update({
        where: { id: usage.id },
        data: { chatCount: { increment: 1 } },
      });
      await invalidateConversationCaches(conversation.id, req.user.id);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      res.write(
        `data: ${JSON.stringify({
          done: true,
          messageId: modelMessage.id,
          reply: fallbackReply,
          references,
          groundingChunks: groundingChunks ?? [],
        })}\n\n`,
      );
      res.end();
      return;
    }
    if (/key not allowed to access model|only access models=/.test(String(msg))) {
      msg = `โมเดลแชทไม่ตรงกับที่ API key รองรับ — ตั้ง OPENAI_MODEL ใน Backend/.env. รายละเอียด: ${msg}`;
    }
    res.status(500).json({ error: msg });
  }
});

chatRouter.post("/", authenticate, async (req, res) => {
  const { conversationId, message } = req.body ?? {};

  if (!conversationId || !message) {
    res.status(400).json({ error: "conversationId and message are required" });
    return;
  }
  // โหมดส่วนตัว: เคารพสวิตช์ที่ client ส่งมา (true/false); ถ้าไม่ส่ง (undefined) จะ fallback เป็น conversation.private
  const bodyPrivateMode = typeof req.body?.privateMode === "boolean" ? req.body.privateMode : undefined;
  const bodyPrivateContent = typeof req.body?.privateContent === "string" ? req.body.privateContent.trim() : "";
  // ไม่ใช้ rate limit ต่อนาที สำหรับแชท
  const usage = await getOrCreateUsageDaily(req.user.id);
  if (usage.chatCount >= MAX_DAILY_CHAT_MESSAGES) {
    res.status(429).json({ error: "Daily chat quota exceeded" });
    return;
  }
  if (FREE_DAILY_TOKEN_LIMIT > 0 && getUsedTokensFromRow(usage) >= FREE_DAILY_TOKEN_LIMIT) {
    res.status(429).json({ error: "Daily token quota exceeded" });
    return;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: req.user.id },
    include: {
      document: true,
      bot: {
        include: {
          documents: {
            include: { document: true },
          },
        },
      },
    },
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // โหมดส่วนตัว: เคารพสวิตช์จาก client ถ้าส่งมา; ไม่งั้นใช้สถานะห้อง (conversation.private)
  const privateMode = typeof bodyPrivateMode === "boolean" ? bodyPrivateMode : conversation.private === true;
  let privateInstructions = "";
  let privateKnowledge = "";
  let privateMemory = "";
  if (privateMode) {
    const parts = await loadPrivateContextParts(req.user.id);
    privateInstructions = parts.instructions;
    privateKnowledge = parts.knowledge;
    privateMemory = await loadCrossChatMemory(req.user.id, conversationId);
  }
  const hasPrivateContext = !!(privateInstructions || privateKnowledge || privateMemory);

  if (isUnintelligibleQuery(message)) {
    const fallbackReply = getUnintelligibleReply();
    await prisma.message.create({
      data: {
        conversationId,
        userId: req.user.id,
        role: "user",
        content: message,
        platform: getPlatform(req),
      },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: fallbackReply,
        platform: getPlatform(req),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.json({
      reply: fallbackReply,
      groundingChunks: [],
      references: [],
      messageId: modelMessage.id,
    });
    return;
  }

  const privacyWarning = buildPersonalInfoWarning(message);
  if (privacyWarning) {
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: { conversationId, role: "model", content: privacyWarning, platform: getPlatform(req) },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.json({ reply: privacyWarning, groundingChunks: [], references: [], messageId: modelMessage.id });
    return;
  }

  const greetingOnly = isGreetingOnly(message);
  if (greetingOnly) {
    res.json({ reply: GREETING_REPLY, groundingChunks: [] });
    void (async () => {
      await prisma.message.create({
        data: {
          conversationId,
          userId: req.user.id,
          role: "user",
          content: message,
          platform: getPlatform(req),
        },
      });
      await prisma.message.create({
        data: {
          conversationId,
          role: "model",
          content: GREETING_REPLY,
          platform: getPlatform(req),
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
      });
      await prisma.usageDaily.update({
        where: { id: usage.id },
        data: { chatCount: { increment: 1 } },
      });
      await invalidateConversationCaches(conversation.id, req.user.id);
    })().catch((error) => console.error("Greeting save failed", error));
    return;
  }
  if (shouldForceNoDataReply(message)) {
    const fallbackReply = getNoDataReply(message);
    await prisma.message.create({
      data: {
        conversationId,
        userId: req.user.id,
        role: "user",
        content: message,
        platform: getPlatform(req),
      },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: fallbackReply,
        platform: getPlatform(req),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.json({
      reply: fallbackReply,
      groundingChunks: [],
      references: [],
      messageId: modelMessage.id,
    });
    return;
  }

  const botDocIds = conversation.bot?.documents
    ?.map((link) => link.document?.id)
    .filter(Boolean);
  const defaultDocumentIds =
    botDocIds && botDocIds.length > 0
      ? Array.from(new Set(botDocIds.map(String)))
      : [conversation.document.id];
  const rawContextDocs =
    botDocIds && botDocIds.length > 0
      ? conversation.bot?.documents?.map((link) => link.document).filter(Boolean)
      : [conversation.document];
  if (isSystemCapabilityQuery(message)) {
    const capabilityReply = getSystemCapabilityReply(rawContextDocs);
    await prisma.message.create({
      data: {
        conversationId,
        userId: req.user.id,
        role: "user",
        content: message,
        platform: getPlatform(req),
      },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: capabilityReply,
        platform: getPlatform(req),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.json({
      reply: capabilityReply,
      groundingChunks: [],
      references: [],
      messageId: modelMessage.id,
    });
    return;
  }
  const { primaryDocumentIds, secondaryDocumentIds } = resolveRetrievalTargets(
    message,
    rawContextDocs,
    defaultDocumentIds,
  );
  const retrievalQuery = await buildStandaloneQuery(message, conversationId);
  let { groundingChunks, retrievalDocumentIds } = await resolveGroundingChunks({
    message,
    conversationId,
    retrievalQuery,
    primaryDocumentIds,
    secondaryDocumentIds,
    fast: req.body?.mode === "fast",
  });
  const contextDocuments = filterContextDocsByIds(rawContextDocs, retrievalDocumentIds);
  if (groundingChunks.length === 0) {
    const keywordFallbackChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 5);
    if (keywordFallbackChunks.length > 0) groundingChunks = keywordFallbackChunks;
  } else {
    // Hybrid search: เสริมผล keyword (เลขที่/ราคา/มาตรา ที่ vector อาจพลาด) แล้ว dedupe คงลำดับ vector ก่อน
    const keywordChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 4);
    if (keywordChunks.length > 0) {
      groundingChunks = mergeHybridChunks(groundingChunks, keywordChunks, Math.max(Number(MAX_CONTEXT_PIECES) || 12, groundingChunks.length));
    }
  }
  const contextPieces = buildContextPiecesWithNeighbors(groundingChunks, contextDocuments, message, {
    maxPieces: hasMultipleQuestions(message)
      ? Math.min((Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 12) * 2, 28)
      : (Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 12),
    neighborWindow: Number.isFinite(CONTEXT_NEIGHBOR_WINDOW) ? CONTEXT_NEIGHBOR_WINDOW : 0,
  });
  let contextText = contextPieces.join("\n\n---\n\n");
  // โหมดหลายคำถาม: ประกอบ context ใหม่แบบแยกบล็อกต่อข้อ (sectioned) กันข้อมูล/เลขคำสั่งแต่ละข้อปนกันจนโมเดลสับสน
  if (hasMultipleQuestions(message)) {
    try {
      const sectionedGroups = await retrieveGroundingGroups(retrievalDocumentIds, retrievalQuery, { fast: false });
      const sectionedContext = buildSectionedContext(sectionedGroups);
      if (sectionedContext) contextText = sectionedContext;
    } catch (_) {}
  }
  const isHelpBot = conversation.bot?.name === HELP_BOT_NAME;
  const overviewRequest = !isHelpBot && isOverviewStyleQuery(message);
  const followUpIntent = isLikelyFollowUp(message);
  if (!contextText && contextDocuments.length > 0 && overviewRequest) {
    contextText = getFallbackContextFromDocuments(contextDocuments);
  }
  if (contextText && contextText.length > MAX_CONTEXT_CHARS_FOR_MODEL) {
    contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS_FOR_MODEL)}\n\n[context truncated]`;
  }
  const ntPricingReply = await getNtCorpInternetPricingReply(message);
  const deterministicReply = ntPricingReply || (deterministicRulesEnabled ? getDeterministicRuleReply(message) : null);
  const deterministicMultiQuestion = Boolean(deterministicReply) && !ntPricingReply && hasMultipleQuestions(message);
  if (deterministicReply && !deterministicMultiQuestion) {
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: deterministicReply,
        groundingChunks: groundingChunks ?? undefined,
        references: references.length > 0 ? references : undefined,
        platform: getPlatform(req),
      },
    });
    const updates = { updatedAt: new Date() };
    if (!conversation.title) updates.title = message.trim().slice(0, 80);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: updates,
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    res.json({
      reply: deterministicReply,
      groundingChunks: modelMessage.groundingChunks ?? [],
      references,
      messageId: modelMessage.id,
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    return;
  }
  const hasEvidence = hasSufficientGroundingEvidence(message, groundingChunks);
  const rejectNoGrounding = !isHelpBot && !overviewRequest && !isGreeting(message)
    && !followUpIntent
    && !deterministicReply
    && !hasPrivateContext
    && (groundingChunks.length === 0 || !hasEvidence);
  if (rejectNoGrounding) {
    const fallbackReply = getNoDataReply(message);
    await prisma.message.create({
      data: {
        conversationId,
        userId: req.user.id,
        role: "user",
        content: message,
        platform: getPlatform(req),
      },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: fallbackReply,
        platform: getPlatform(req),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    res.json({
      reply: fallbackReply,
      groundingChunks: [],
      references: [],
      messageId: modelMessage.id,
    });
    return;
  }
  if (deterministicRulesEnabled && isApproverRolesQuery(message)) {
    const reply = buildApproverRolesReply(groundingChunks, contextText);
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: reply,
        groundingChunks: groundingChunks ?? undefined,
        references: references.length > 0 ? references : undefined,
        platform: getPlatform(req),
      },
    });
    const updates = { updatedAt: new Date() };
    if (!conversation.title) updates.title = message.trim().slice(0, 80);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: updates,
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: { chatCount: { increment: 1 } },
    });
    res.json({
      reply,
      groundingChunks: modelMessage.groundingChunks ?? [],
      references,
      messageId: modelMessage.id,
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    return;
  }

  const policyPrompt = buildPolicyPrompt({ isHelpBot, message, overviewRequest, analytical: true });

  const systemParts = [policyPrompt];
  if (conversation.bot?.prompt && String(conversation.bot.prompt).trim()) {
    systemParts.push(`คำสั่งเพิ่มเติมจากผู้สร้างบอท:\n${conversation.bot.prompt.trim()}`);
  }
  if (hasPrivateContext) {
    systemParts.push(
      "โหมดส่วนตัว: ผู้ใช้ได้ตั้งค่าส่วนตัวไว้ (อาจมี 'คำสั่งจากผู้ใช้', 'ข้อมูล/ความรู้ส่วนตัว' และ 'บทสนทนาก่อนหน้า'). ให้ทำตามคำสั่งของผู้ใช้อย่างเคร่งครัด, ใช้ข้อมูลส่วนตัวและความจำก่อนหน้าตอบได้เต็มที่ร่วมกับ Context จากเอกสารระบบ, ห้ามตอบว่าไม่พบข้อมูลถ้าตอบได้จากส่วนเหล่านี้, และเมื่อข้อมูลส่วนตัวขัดกับเอกสารระบบให้ระบุที่มาทั้งสองฝั่งอย่างชัดเจน.",
    );
  }
  const systemPrompt = systemParts.filter(Boolean).join("\n\n");

  // ใช้ history เฉพาะคำถามต่อเนื่อง เพื่อลดการถูก history เก่ากดทับ retrieval ปัจจุบัน
  const baseHistoryLimit = Math.max(0, Number.isFinite(MAX_CHAT_HISTORY_MESSAGES) ? MAX_CHAT_HISTORY_MESSAGES : 20);
  const historyLimit = followUpIntent ? Math.min(baseHistoryLimit, 4) : 0;
  const historyRows =
    historyLimit > 0
      ? await prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: "desc" },
          take: historyLimit,
          select: { role: true, content: true },
        })
      : [];
  const historyMessages = historyRows
    .reverse()
    .map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: String(m.content ?? "").trim(),
    }))
    .filter((m) => m.content.length > 0);

  const contextLabel = isHelpBot ? "Context (from user guide)" : "Context";
  const messages = [
    { role: "system", content: systemPrompt },
    ...(contextText ? [{ role: "system", content: `${contextLabel}:\n${contextText}` }] : []),
    ...buildPrivateSystemMessages({ instructions: privateInstructions, knowledge: privateKnowledge, memory: privateMemory }),
    ...(deterministicReply
      ? [{
          role: "system",
          content: `ข้อมูลที่ยืนยันแล้ว (authoritative): สำหรับส่วนของคำถามที่ตรงกับข้อมูลนี้ ให้ใช้ข้อความนี้ตรงตัว ห้ามแก้ตัวเลขหรือถ้อยคำ และต้องตอบส่วนอื่นของคำถามให้ครบด้วย:\n${deterministicReply}`,
        }]
      : []),
    ...(isComparativeAuthorityQuery(message)
      ? [{
          role: "system",
          content: "คำถามนี้เป็นการเปรียบเทียบหลายกรณี ให้ตอบแยกทีละกรณีตามเงื่อนไขตัวเลขในคำถาม และถ้าข้อมูลไม่ครบให้ระบุว่ากรณีใดไม่พบหลักฐาน",
        }]
      : []),
    ...historyMessages,
    { role: "user", content: message },
  ];

  try {
    await prisma.message.create({
      data: {
        conversationId,
        userId: req.user.id,
        role: "user",
        content: message,
        platform: getPlatform(req),
      },
    });

    // ใช้ OPENAI_MODEL จาก .env เสมอ — คีย์ gateway มักรองรับแค่บางโมเดล (เช่น gpt-4o-mini) ถ้าใช้ bot.model อาจได้ 401
    const gatewayResponse = await callOpenAiGateway(messages, undefined, req.body?.mode === "fast" ? "fast" : undefined);
    const tokenUsage = getTokenUsage(gatewayResponse);
    const rawReply =
      gatewayResponse?.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I could not generate a response.";

    let replyToSave = rawReply;
    let suggestions = [];
    const suggestionsMatch = rawReply.match(/\n\s*SUGGESTIONS\s*:\s*\n([\s\S]*)/i);
    if (suggestionsMatch) {
      replyToSave = rawReply.slice(0, suggestionsMatch.index).trim();
      const lines = suggestionsMatch[1]
        .split("\n")
        .map((s) => s.replace(/^[\s\-*\d.)]+/, "").trim())
        .filter(Boolean);
      suggestions = lines.slice(0, 5);
    }

    replyToSave = stripDocumentLeadIn(replyToSave);
    replyToSave = stripRedundantShortSummary(replyToSave);
    replyToSave = toCompactAuthorityReply(message, replyToSave);

    const references = buildReferencesForReply({
      groundingChunks,
      contextDocuments,
      primaryDocument: conversation.document,
      message,
      hasPrivateContext,
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: replyToSave,
        groundingChunks: groundingChunks ?? undefined,
        references: references.length > 0 ? references : undefined,
        platform: getPlatform(req),
      },
    });

    const updates = { updatedAt: new Date() };
    if (!conversation.title) {
      updates.title = message.trim().slice(0, 80);
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: updates,
    });
    await prisma.usageDaily.update({
      where: { id: usage.id },
      data: {
        chatCount: { increment: 1 },
        promptTokens: { increment: tokenUsage.promptTokens },
        completionTokens: { increment: tokenUsage.completionTokens },
        totalTokens: { increment: tokenUsage.totalTokens },
      },
    });
    res.json({
      reply: replyToSave,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      groundingChunks: modelMessage.groundingChunks ?? [],
      references,
      messageId: modelMessage.id,
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
  } catch (error) {
    console.error("Chat completion failed", error);
    let msg = error instanceof Error ? error.message : "Chat failed";
    if (/key not allowed to access model|only access models=/.test(String(msg))) {
      msg = `โมเดลแชทไม่ตรงกับที่ API key รองรับ — ตั้ง OPENAI_MODEL ใน Backend/.env ให้ตรงกับโมเดลที่คีย์ใช้ได้ (เช่น gpt-4o-mini). รายละเอียด: ${msg}`;
    }
    res.status(500).json({ error: msg });
  }
});

const LINE_PLATFORM = "line";

/**
 * หาคำตอบจากบอทสำหรับ conversation ที่มีอยู่แล้ว (ใช้จาก LINE webhook)
 * @param {string} conversationId
 * @param {string} message - ข้อความจากผู้ใช้
 * @param {string} userId - User ID ในระบบ (เจ้าของ conversation)
 * @returns {Promise<{ reply: string }>}
 */
export async function getChatReplyForLine(conversationId, message, userId) {
  // โหมดส่วนตัวไม่รองรับบนช่องทาง LINE (ตั้งค่าให้ guardrail/inject ทำงานเหมือนเดิม)
  const privateInstructions = "";
  const privateKnowledge = "";
  const privateMemory = "";
  const hasPrivateContext = false;
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      document: true,
      bot: { include: { documents: { include: { document: true } } } },
    },
  });
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const usage = await getOrCreateUsageDaily(userId);
  const botDocIds = conversation.bot?.documents?.map((l) => l.document?.id).filter(Boolean);
  const defaultDocumentIds =
    botDocIds && botDocIds.length > 0
      ? Array.from(new Set(botDocIds.map(String)))
      : [conversation.document.id];
  const rawContextDocs =
    botDocIds && botDocIds.length > 0
      ? conversation.bot?.documents?.map((l) => l.document).filter(Boolean)
      : [conversation.document];
  if (isUnintelligibleQuery(message)) {
    const fallbackReply = getUnintelligibleReply();
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: { conversationId, role: "model", content: fallbackReply, platform: LINE_PLATFORM },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: fallbackReply };
  }
  if (isSystemCapabilityQuery(message)) {
    const capabilityReply = getSystemCapabilityReply(rawContextDocs);
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: { conversationId, role: "model", content: capabilityReply, platform: LINE_PLATFORM },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: capabilityReply };
  }
  const { primaryDocumentIds, secondaryDocumentIds } = resolveRetrievalTargets(
    message,
    rawContextDocs,
    defaultDocumentIds,
  );
  let retrievalDocumentIds = primaryDocumentIds;
  let groundingChunks = [];
  const contextDocumentsFrom = (ids) => filterContextDocsByIds(rawContextDocs, ids);

  const privacyWarning = buildPersonalInfoWarning(message);
  if (privacyWarning) {
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: { conversationId, role: "model", content: privacyWarning, platform: LINE_PLATFORM },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: privacyWarning };
  }

  if (isGreetingOnly(message)) {
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: { conversationId, role: "model", content: GREETING_REPLY, platform: LINE_PLATFORM },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: GREETING_REPLY };
  }
  if (shouldForceNoDataReply(message)) {
    const fallbackReply = getNoDataReply(message);
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: { conversationId, role: "model", content: fallbackReply, platform: LINE_PLATFORM },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: fallbackReply };
  }

  const retrievalQuery = await buildStandaloneQuery(message, conversationId);
  ({ groundingChunks, retrievalDocumentIds } = await resolveGroundingChunks({
    message,
    conversationId,
    retrievalQuery,
    primaryDocumentIds,
    secondaryDocumentIds,
  }));
  const contextDocuments = contextDocumentsFrom(retrievalDocumentIds);
  if (groundingChunks.length === 0) {
    const keywordFallbackChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 5);
    if (keywordFallbackChunks.length > 0) groundingChunks = keywordFallbackChunks;
  } else {
    // Hybrid search: เสริมผล keyword (เลขที่/ราคา/มาตรา ที่ vector อาจพลาด) แล้ว dedupe คงลำดับ vector ก่อน
    const keywordChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 4);
    if (keywordChunks.length > 0) {
      groundingChunks = mergeHybridChunks(groundingChunks, keywordChunks, Math.max(Number(MAX_CONTEXT_PIECES) || 12, groundingChunks.length));
    }
  }
  const contextPieces = buildContextPiecesWithNeighbors(groundingChunks, contextDocuments, message, {
    maxPieces: hasMultipleQuestions(message)
      ? Math.min((Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 12) * 2, 28)
      : (Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 12),
    neighborWindow: Number.isFinite(CONTEXT_NEIGHBOR_WINDOW) ? CONTEXT_NEIGHBOR_WINDOW : 0,
  });
  let contextText = contextPieces.join("\n\n---\n\n");
  // โหมดหลายคำถาม: ประกอบ context ใหม่แบบแยกบล็อกต่อข้อ (sectioned) กันข้อมูล/เลขคำสั่งแต่ละข้อปนกันจนโมเดลสับสน
  if (hasMultipleQuestions(message)) {
    try {
      const sectionedGroups = await retrieveGroundingGroups(retrievalDocumentIds, retrievalQuery, { fast: false });
      const sectionedContext = buildSectionedContext(sectionedGroups);
      if (sectionedContext) contextText = sectionedContext;
    } catch (_) {}
  }
  const isHelpBot = conversation.bot?.name === HELP_BOT_NAME;
  const overviewRequest = !isHelpBot && isOverviewStyleQuery(message);
  const followUpIntent = isLikelyFollowUp(message);
  if (!contextText && contextDocuments.length > 0 && overviewRequest) {
    contextText = getFallbackContextFromDocuments(contextDocuments);
  }
  const ntPricingReply = await getNtCorpInternetPricingReply(message);
  const deterministicReply = ntPricingReply || (deterministicRulesEnabled ? getDeterministicRuleReply(message) : null);
  const deterministicMultiQuestion = Boolean(deterministicReply) && !ntPricingReply && hasMultipleQuestions(message);
  if (deterministicReply && !deterministicMultiQuestion) {
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: deterministicReply,
        groundingChunks: groundingChunks ?? undefined,
        references: references.length > 0 ? references : undefined,
        platform: LINE_PLATFORM,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: deterministicReply };
  }
  const hasEvidence = hasSufficientGroundingEvidence(message, groundingChunks);
  const rejectNoGrounding = !isHelpBot && !overviewRequest && !isGreeting(message)
    && !followUpIntent
    && !deterministicReply
    && !hasPrivateContext
    && (groundingChunks.length === 0 || !hasEvidence);
  if (rejectNoGrounding) {
    const fallbackReply = getNoDataReply(message);
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: { conversationId, role: "model", content: fallbackReply, platform: LINE_PLATFORM },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: fallbackReply };
  }
  if (deterministicRulesEnabled && isApproverRolesQuery(message)) {
    const reply = buildApproverRolesReply(groundingChunks, contextText);
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: reply,
        groundingChunks: groundingChunks ?? undefined,
        references: references.length > 0 ? references : undefined,
        platform: LINE_PLATFORM,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply };
  }
  const policyPrompt = isHelpBot
    ? [
        "You are a helpful Thai AI assistant.",
        "Scope: ตอบจาก Context ที่ให้มาเท่านั้น ห้ามแต่งข้อมูล.",
        "Rules: 1) Answer in Thai. 2) Keep concise. 3) If outside scope, say context is insufficient.",
      ].join("\n")
    : [
        "You are a helpful Thai AI assistant that answers from the provided Context. Answer in Thai.",
        "Scope: ตอบเฉพาะจาก Context เท่านั้น ห้ามใช้ความรู้จากภายนอก.",
        "Rules: 1) Base answer ONLY on Context. 2) If not in Context reply: ขออภัยครับ ข้อมูลส่วนนี้ไม่มีอยู่ในฐานข้อมูลของผม",
        "Rules: 3) ถ้ามีหลายเงื่อนไขในคำถาม ให้แยกตอบเป็นรายกรณีในกรอบข้อมูลที่มี",
        "Rules: 4) ตัวเลข/ราคา/อำนาจอนุมัติ ให้ยึดจาก Context เท่านั้น ห้ามดึงจากประวัติสนทนา — ใช้ประวัติเพียงเพื่อเข้าใจว่าผู้ใช้อ้างถึงอะไร",
        ...getResponseFormatRulesForMessage(message),
      ].join("\n");
  const systemParts = [policyPrompt];
  if (conversation.bot?.prompt?.trim()) systemParts.push(`คำสั่งเพิ่มเติม:\n${conversation.bot.prompt.trim()}`);
  if (hasPrivateContext) {
    systemParts.push(
      "โหมดส่วนตัว: ผู้ใช้ได้ตั้งค่าส่วนตัวไว้ (อาจมี 'คำสั่งจากผู้ใช้', 'ข้อมูล/ความรู้ส่วนตัว' และ 'บทสนทนาก่อนหน้า'). ให้ทำตามคำสั่งของผู้ใช้อย่างเคร่งครัด, ใช้ข้อมูลส่วนตัวและความจำก่อนหน้าตอบได้เต็มที่ร่วมกับ Context จากเอกสารระบบ, ห้ามตอบว่าไม่พบข้อมูลถ้าตอบได้จากส่วนเหล่านี้, และเมื่อข้อมูลส่วนตัวขัดกับเอกสารระบบให้ระบุที่มาทั้งสองฝั่งอย่างชัดเจน.",
    );
  }
  const systemPrompt = systemParts.filter(Boolean).join("\n\n");

  if (!contextText && !isHelpBot && !isGreeting(message) && !deterministicReply) {
    const fallbackReply = getNoDataReply(message);
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: { conversationId, role: "model", content: fallbackReply, platform: LINE_PLATFORM },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: fallbackReply };
  }

  const historyLimit = followUpIntent
    ? Math.min(
        Math.max(0, Number.isFinite(MAX_CHAT_HISTORY_MESSAGES) ? MAX_CHAT_HISTORY_MESSAGES : 20),
        4,
      )
    : 0;
  const historyRows =
    historyLimit > 0
      ? await prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: "desc" },
          take: historyLimit,
          select: { role: true, content: true },
        })
      : [];
  const historyMessages = historyRows
    .reverse()
    .map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: String(m.content ?? "").trim() }))
    .filter((m) => m.content.length > 0);
  const contextLabel = isHelpBot ? "Context (from user guide)" : "Context";
  const messages = [
    { role: "system", content: systemPrompt },
    ...(contextText ? [{ role: "system", content: `${contextLabel}:\n${contextText}` }] : []),
    ...buildPrivateSystemMessages({ instructions: privateInstructions, knowledge: privateKnowledge, memory: privateMemory }),
    ...(deterministicReply
      ? [{
          role: "system",
          content: `ข้อมูลที่ยืนยันแล้ว (authoritative): สำหรับส่วนของคำถามที่ตรงกับข้อมูลนี้ ให้ใช้ข้อความนี้ตรงตัว ห้ามแก้ตัวเลขหรือถ้อยคำ และต้องตอบส่วนอื่นของคำถามให้ครบด้วย:\n${deterministicReply}`,
        }]
      : []),
    ...(isComparativeAuthorityQuery(message)
      ? [{
          role: "system",
          content: "คำถามนี้เป็นการเปรียบเทียบหลายกรณี ให้ตอบแยกทีละกรณีตามเงื่อนไขตัวเลขในคำถาม และถ้าข้อมูลไม่ครบให้ระบุว่ากรณีใดไม่พบหลักฐาน",
        }]
      : []),
    ...historyMessages,
    { role: "user", content: message },
  ];

  await prisma.message.create({
    data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
  });
  const gatewayResponse = await callOpenAiGateway(messages, undefined);
  const tokenUsage = getTokenUsage(gatewayResponse);
  const rawReply =
    gatewayResponse?.choices?.[0]?.message?.content?.trim() || "Sorry, I could not generate a response.";
  let replyToSave = rawReply;
  const suggestionsMatch = rawReply.match(/\n\s*SUGGESTIONS\s*:\s*\n([\s\S]*)/i);
  if (suggestionsMatch) replyToSave = rawReply.slice(0, suggestionsMatch.index).trim();

  replyToSave = stripDocumentLeadIn(replyToSave);
  replyToSave = stripRedundantShortSummary(replyToSave);
  replyToSave = toCompactAuthorityReply(message, replyToSave);

  const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
  await prisma.message.create({
    data: {
      conversationId,
      role: "model",
      content: replyToSave,
      groundingChunks: groundingChunks ?? undefined,
      references: references.length > 0 ? references : undefined,
      platform: LINE_PLATFORM,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
  });
  await prisma.usageDaily.update({
    where: { id: usage.id },
    data: {
      chatCount: { increment: 1 },
      promptTokens: { increment: tokenUsage.promptTokens },
      completionTokens: { increment: tokenUsage.completionTokens },
      totalTokens: { increment: tokenUsage.totalTokens },
    },
  });
  await invalidateConversationCaches(conversation.id, userId);
  return { reply: replyToSave };
}
