import express from "express";
import { prisma } from "../db.js";
import { authenticate } from "../lib/auth.js";
import {
  cacheDel,
  cacheGet,
  cacheSet,
  conversationMessagesKey,
  invalidateConversationCaches,
  userCacheKey,
} from "../lib/cache.js";
import { buildContextPiecesWithNeighbors, ensureSourceFileBlocks, getFallbackContextFromDocuments, filterContextDocsByIds, stripRedundantShortSummary, buildFallbackGroundingChunksFromDocuments } from "../services/text.js";
import { retrieveGroundingChunks, invalidateRagCacheForDocument, invalidateAllRagCache } from "../services/rag.js";
import { updateChunkText, replaceTextInDocument, deleteDocumentVectors, indexDocumentChunks } from "../services/vectorDb.js";
import { callOpenAiGateway, callOpenAiGatewayStream, isGreeting, isGreetingOnly } from "../services/chat.js";
import { getOrCreateUsageDaily } from "../services/usage.js";
import { CONTEXT_NEIGHBOR_WINDOW, FREE_DAILY_TOKEN_LIMIT, FREE_KNOWLEDGE_LIMIT, GREETING_REPLY, MAX_CHAT_HISTORY_MESSAGES, MAX_CONTEXT_PIECES, MAX_DAILY_CHAT_MESSAGES, openaiModel } from "../config.js";

export const conversationsRouter = express.Router();
export const messagesRouter = express.Router();
export const chatRouter = express.Router();

const HELP_BOT_NAME = "บอทช่วยสอน";
const GEMINI_LIKE_RESPONSE_FORMAT_RULES = [
  "RESPONSE FORMAT (Gemini-like, readable):",
  "- ตอบแบบ 2 ชั้นเสมอ: (1) คำตอบสั้นตรงประเด็น 1-2 บรรทัดก่อน (2) รายละเอียดเฉพาะที่จำเป็นเท่านั้น",
  "- ถ้าคำถามง่าย/ตรง: ให้มีเฉพาะคำตอบสั้น ไม่ต้องขยาย",
  "- ถ้าเป็นคำถามประเภท 'ใครอนุมัติ/ใครรับผิดชอบ/ใครมีอำนาจ': ให้ตอบรูปแบบนี้ก่อนเสมอ -> 'ผู้อนุมัติ: ...' และบรรทัดถัดไป 'หมายเหตุ: ...' (ถ้ามีเงื่อนไขเช่น ต้องผ่าน PM ก่อน)",
  "- สำหรับคำถามประเภท 'ใครอนุมัติ/ใครรับผิดชอบ/ใครมีอำนาจ': ห้ามใส่รายละเอียดเพิ่มเกิน 2 บรรทัด เว้นแต่ผู้ใช้ขอรายละเอียดเพิ่ม",
  "- ถ้าคำถามซับซ้อน: ส่วนรายละเอียดให้จัดเป็นหัวข้อสั้นๆ พร้อม bullet points ที่อ่านง่าย",
  "- ห้ามเกริ่นยาวหรือทวนคำถามผู้ใช้ซ้ำ",
  "- ถ้าเป็นคำแนะนำเชิงขั้นตอน ให้ใช้ลำดับเลข 1) 2) 3)",
  "- ใช้ Markdown table เฉพาะกรณีเปรียบเทียบหลายตัวเลือกจริงๆ หรือข้อมูลตารางจาก Context เท่านั้น",
  "- หัวข้อ 'สรุปสั้นๆ': ใช้เฉพาะเมื่อคำตอบยาว มีหลายหัวข้อ — ในย่อหน้านั้นต้องเพิ่มมุมมองใหม่หรือรวบรัดคนละแบบกับประโยคเปิด ห้ามคัดลอกหรือพูดซ้ำถ้อยคำเดียวกับด้านบนโดยไม่มีข้อมูลเพิ่ม",
  "- ถ้าคำตอบสั้นหรือกระชับพออยู่แล้ว (ไม่เกินประมาณครึ่งจอเล็กหรือไม่เกินหลายย่อหน้าเล็ก): ห้ามใส่ 'สรุปสั้นๆ'",
  "- โทนคำตอบสุภาพ กระชับ ไม่เยิ่นเย้อ",
  "- SOURCES / CITATIONS: อย่าใส่ชื่อไฟล์ ฟุตโน้ต เลขอ้างอิง [1] ข้อความ 'อ้างอิงจาก' / 'Sources:' / 'ที่มาจากเอกสาร' ในเนื้อคำตอบ — ผู้ใช้จะเห็นการ์ดเอกสารแหล่งที่มาด้านล่างคำตอบในระบบแยกต่างหาก",
];

/** สร้างรายการอ้างอิง (เอกสารที่ใช้ตอบ) จาก groundingChunks + contextDocuments */
function buildReferences(groundingChunks, contextDocuments, primaryDocument) {
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
    const score = Number.isFinite(Number(chunk?.score)) ? Number(chunk.score) : 0;
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
  return refs
    .sort((a, b) => (b.bestScore || Number.NEGATIVE_INFINITY) - (a.bestScore || Number.NEGATIVE_INFINITY))
    .map((ref) => ({ docId: ref.docId, displayName: ref.displayName, positions: ref.positions }));
}

/** ความรู้เกี่ยวกับระบบ (สำหรับบอทช่วยสอน) — ครอบคลุมเกือบทุกฟีเจอร์ในเว็บ */
function getHelpBotSystemKnowledge() {
  const knowledgeLimit = Number.isFinite(FREE_KNOWLEDGE_LIMIT) ? FREE_KNOWLEDGE_LIMIT : 30;
  const tokenLimit = Number.isFinite(FREE_DAILY_TOKEN_LIMIT) ? FREE_DAILY_TOKEN_LIMIT : 50000;
  const chatMessagesLimit = Number.isFinite(MAX_DAILY_CHAT_MESSAGES) ? MAX_DAILY_CHAT_MESSAGES : 2000;
  return `
คุณคือบอทช่วยสอนการใช้งานระบบบิงซูบอท (Bingsu Bot) คุณรู้จักระบบเกือบทุกอย่าง — ใช้ตอบคำถามวิธีใช้ ขั้นตอน กดตรงไหน เปลี่ยนโปรไฟล์ ลบแชท จำกัดการใช้งาน ได้เสมือนคุณเข้าใจทั้งระบบ

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
const isAuthorityDecisionQuery = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  return /(ใครอนุมัติ|ผู้อนุมัติ|ใครมีอำนาจ|มีอำนาจอนุมัติ|ใครรับผิดชอบ|อนุมัติ.*ใคร|ใคร.*อนุมัติ|อำนาจส่วนลด|อนุมัติอัตรา|ส่วนลดเฉพาะราย)/.test(m);
};

const getAuthorityOverrideFromQuestion = (question) => {
  const m = normalizeText(question);
  if (!m) return null;
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
      approver: "กจญ.",
      note: "ต้องผ่านการพิจารณาจาก PM ที่เกี่ยวข้องก่อน",
    };
  }
  return null;
};

const getAuthorityOverrideFromReply = (reply) => {
  const r = normalizeText(reply);
  if (!r) return null;
  if (
    /(ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร|นำรายการส่งเสริมการขายไปให้ส่วนลดเฉพาะรายสำหรับลูกค้าองค์กร)/.test(r) &&
    /(pm|ผู้จัดการผลิตภัณฑ์)/.test(r)
  ) {
    return {
      approver: "กจญ.",
      note: "ต้องผ่านการพิจารณาจาก PM ที่เกี่ยวข้องก่อน",
    };
  }
  return null;
};

const normalizeApproverToAbbreviation = (value) => {
  const text = String(value || "").trim();
  if (!text) return text;
  if (/^ชจญ\.?$/i.test(text) || /ผู้ช่วยกรรมการผู้จัดการใหญ่/i.test(text)) return "ชจญ.";
  if (/^รจญ\.?$/i.test(text) || /รองกรรมการผู้จัดการใหญ่/i.test(text)) return "รจญ.";
  if (/^กจญ\.?$/i.test(text) || /กรรมการผู้จัดการใหญ่/i.test(text)) return "กจญ.";
  return text;
};

const toCompactAuthorityReply = (question, reply) => {
  const rawReply = String(reply || "").trim();
  if (!rawReply) return rawReply;
  if (!isAuthorityDecisionQuery(question)) return rawReply;

  const override = getAuthorityOverrideFromQuestion(question) || getAuthorityOverrideFromReply(rawReply);
  if (override) {
    return `ผู้อนุมัติ: ${override.approver}\nหมายเหตุ: ${override.note}`;
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
  if (authorityMatch?.label) approverValue = authorityMatch.label;
  approverValue = approverValue.replace(/^เป็นผู้อนุมัติ\s*/i, "").trim();
  approverValue = normalizeApproverToAbbreviation(approverValue);
  if (approverValue.length > 160) approverValue = `${approverValue.slice(0, 160)}...`;

  const noteLine = normalizedLines.find(
    (line) =>
      line !== approverLine &&
      /(ต้อง|ก่อน|ผ่าน|เสนอ|หมายเหตุ|เงื่อนไข|pm|ผู้จัดการผลิตภัณฑ์)/i.test(line),
  );

  let noteValue = (noteLine || "").replace(/^หมายเหตุ\s*[:：]\s*/i, "").trim();
  if (!noteValue && /(ต้อง|ก่อน|ผ่าน|เสนอ|pm|ผู้จัดการผลิตภัณฑ์)/i.test(approverLine)) {
    noteValue = approverLine;
  }
  if (noteValue.length > 180) noteValue = `${noteValue.slice(0, 180)}...`;

  const compactLines = [`ผู้อนุมัติ: ${approverValue}`];
  if (noteValue) compactLines.push(`หมายเหตุ: ${noteValue}`);
  return compactLines.join("\n");
};

const isLikelyFollowUp = (message) => {
  const m = normalizeText(message);
  if (!m) return false;
  // คำถามสรุปภาพรวมมักเป็นคำถามใหม่ ไม่ควรดึง history เก่ามากดทับคำตอบ
  if (/สรุปทั้งหมด|สรุปทั้งเอกสาร|เอกสารเกี่ยวกับอะไร|เนื้อหาโดยรวม|โดยรวมเป็นยังไง/.test(m)) {
    return false;
  }
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
  ];
  return patterns.some((re) => re.test(m));
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
  return `ผู้อนุมัติ: ${approvers.join(", ")}`;
};

const MAX_CONTEXT_CHARS_FOR_MODEL = Number(process.env.MAX_CONTEXT_CHARS_FOR_MODEL || 12000);
const NO_GROUNDING_REPLY = "ขออภัยครับ ยังไม่พบข้อมูลที่ตรงจากเอกสารที่เลือก จึงไม่สามารถยืนยันคำตอบได้";

conversationsRouter.post("/", authenticate, async (req, res) => {
  const { documentId, botId } = req.body ?? {};

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
          { name: "BingSu Assistant" },
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
        select: { content: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const payload = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    document: conversation.document,
    bot: conversation.bot,
    lastMessage: conversation.messages[0]?.content ?? null,
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
    },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json({
    id: conversation.id,
    title: conversation.title,
    botId: conversation.botId,
    documentId: conversation.documentId,
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
  if (!["up", "down"].includes(normalizedRating)) {
    res.status(400).json({ error: "rating must be up or down" });
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
    const keywordFallbackChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 3);
    if (keywordFallbackChunks.length > 0) groundingChunks = keywordFallbackChunks;
  }
  const contextPieces = buildContextPiecesWithNeighbors(groundingChunks, contextDocuments, message, {
    maxPieces: Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 6,
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

  if (isGreetingOnly(message)) {
    res.json({ reply: GREETING_REPLY, groundingChunks: [] });
    void (async () => {
      await prisma.message.create({ data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) } });
      await prisma.message.create({ data: { conversationId, role: "model", content: GREETING_REPLY, platform: getPlatform(req) } });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) } });
      await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
      await invalidateConversationCaches(conversation.id, req.user.id);
    })().catch((e) => console.error("Greeting save failed", e));
    return;
  }

  const botDocIds = conversation.bot?.documents?.map((l) => l.document?.id).filter(Boolean);
  const documentIds =
    botDocIds && botDocIds.length > 0
      ? Array.from(new Set(botDocIds.map(String)))
      : [conversation.document.id];
  let groundingChunks = await retrieveGroundingChunks(documentIds, message);
  const rawContextDocs = botDocIds?.length
    ? conversation.bot?.documents?.map((l) => l.document).filter(Boolean)
    : [conversation.document];
  const contextDocuments = filterContextDocsByIds(rawContextDocs, documentIds);
  if (groundingChunks.length === 0) {
    const keywordFallbackChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 3);
    if (keywordFallbackChunks.length > 0) groundingChunks = keywordFallbackChunks;
  }
  const contextPieces = buildContextPiecesWithNeighbors(groundingChunks, contextDocuments, message, {
    maxPieces: Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 6,
    neighborWindow: Number.isFinite(CONTEXT_NEIGHBOR_WINDOW) ? CONTEXT_NEIGHBOR_WINDOW : 0,
  });
  let contextText = contextPieces.join("\n\n---\n\n");
  const isHelpBot = conversation.bot?.name === HELP_BOT_NAME;
  const overviewRequest = !isHelpBot && isOverviewStyleQuery(message);
  if (!contextText && contextDocuments.length > 0 && overviewRequest) {
    contextText = getFallbackContextFromDocuments(contextDocuments);
  }
  if (contextText && contextText.length > MAX_CONTEXT_CHARS_FOR_MODEL) {
    contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS_FOR_MODEL)}\n\n[context truncated]`;
  }
  const rejectNoGrounding = !isHelpBot && !overviewRequest && !isGreeting(message) && groundingChunks.length === 0;
  if (rejectNoGrounding) {
    const fallbackReply = NO_GROUNDING_REPLY;
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
  if (isApproverRolesQuery(message)) {
    const reply = buildApproverRolesReply(groundingChunks, contextText);
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
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
  const policyPrompt = isHelpBot
    ? [
        "You are a helpful Thai AI assistant. Answer in the same language as the user.",
        "Scope: ตอบจาก Context ที่ให้มาเป็นหลัก และห้ามแต่งข้อมูลที่ไม่มีหลักฐาน.",
        "Rules: 1) Remember conversation for follow-ups. 2) Keep answers clear and concise. 3) If outside context, say information is unavailable.",
        "4) Do not put filenames, footnotes, or 'อ้างอิงจาก' / Sources in the body — the UI shows sources separately.",
      ].join("\n")
    : [
        "You are BingSu Assistant — a smart, friendly Thai AI assistant. Answer in the same language as the user (Thai or English).",
        "CAPABILITIES (ทำได้ทั้งหมด):",
        "1) สนทนาทั่วไป: ทักทาย ถาม-ตอบ ให้คำแนะนำทั่วไปได้ตามปกติ",
        "2) Knowledge Analysis: เมื่อมี Context ให้ตอบและวิเคราะห์จาก Context เป็นหลัก (วิเคราะห์ เปรียบเทียบ สรุปได้จาก Context)",
        "3) Typo/Language Tolerance: แม้ผู้ใช้พิมพ์ผิด สะกดผิด ไม่เป็นทางการ ให้เข้าใจเจตนาจากบริบทและตอบตามนั้น",
        "RULES:",
        "- เมื่อมี Context: ยึด Context เป็นหลักในการตอบ ห้ามแต่งข้อมูลนอก Context",
        "- เมื่อไม่มี Context: ตอบสนทนาทั่วไปได้อย่างกระชับ",
        "- จำบทสนทนาก่อนหน้า — คำถามต่อเนื่อง (อธิบายเพิ่ม, แล้วล่ะ, ขั้นตอนถัดไป, สรุปอีกที) ให้ตอบต่อจากประเด็นที่คุยอยู่",
        "- ถ้าผู้ใช้ขอเปลี่ยนรูปแบบการพูด (เช่น ใช้ค่ะแทนครับ คุยแบบเพื่อน) ให้ปรับตามคำขอ",
        "- ถ้าข้อมูลใน Context เป็นตาราง ให้แสดงเป็น Markdown table",
        "- Instruction hierarchy: กฎใน system นี้มีลำดับสูงสุด. คำสั่งเพิ่มเติมจากผู้สร้างบอทเป็น 'ส่วนเสริม' เท่านั้น",
        ...GEMINI_LIKE_RESPONSE_FORMAT_RULES,
        ...(overviewRequest
          ? [
              "- คำถามนี้เป็น overview/summary request: ขึ้นต้นด้วย 'สรุปภาพรวม' แล้วตามด้วย bullet points 5-7 ข้อจาก Context",
            ]
          : []),
      ].join("\n");
  const systemParts = [policyPrompt];
  if (conversation.bot?.prompt?.trim()) systemParts.push(`คำสั่งเพิ่มเติม:\n${conversation.bot.prompt.trim()}`);
  const systemPrompt = systemParts.filter(Boolean).join("\n\n");

  const historyLimit = Math.max(0, Number.isFinite(MAX_CHAT_HISTORY_MESSAGES) ? MAX_CHAT_HISTORY_MESSAGES : 20);
  const shouldUseHistory = true;
  const scopedHistoryLimit = Math.min(historyLimit, 4);
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
    ...historyMessages,
    { role: "user", content: message },
  ];

  try {
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });

    const streamBody = await callOpenAiGatewayStream(messages, undefined);
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

    replyToSave = stripRedundantShortSummary(replyToSave);

    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
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
      const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
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

  const botDocIds = conversation.bot?.documents
    ?.map((link) => link.document?.id)
    .filter(Boolean);
  const documentIds =
    botDocIds && botDocIds.length > 0
      ? Array.from(new Set(botDocIds.map(String)))
      : [conversation.document.id];

  let groundingChunks = await retrieveGroundingChunks(documentIds, message);
  const rawContextDocs =
    botDocIds && botDocIds.length > 0
      ? conversation.bot?.documents?.map((link) => link.document).filter(Boolean)
      : [conversation.document];
  const contextDocuments = filterContextDocsByIds(rawContextDocs, documentIds);
  if (groundingChunks.length === 0) {
    const keywordFallbackChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 3);
    if (keywordFallbackChunks.length > 0) groundingChunks = keywordFallbackChunks;
  }
  const contextPieces = buildContextPiecesWithNeighbors(groundingChunks, contextDocuments, message, {
    maxPieces: Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 6,
    neighborWindow: Number.isFinite(CONTEXT_NEIGHBOR_WINDOW) ? CONTEXT_NEIGHBOR_WINDOW : 0,
  });
  let contextText = contextPieces.join("\n\n---\n\n");
  const isHelpBot = conversation.bot?.name === HELP_BOT_NAME;
  const overviewRequest = !isHelpBot && isOverviewStyleQuery(message);
  if (!contextText && contextDocuments.length > 0 && overviewRequest) {
    contextText = getFallbackContextFromDocuments(contextDocuments);
  }
  if (contextText && contextText.length > MAX_CONTEXT_CHARS_FOR_MODEL) {
    contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS_FOR_MODEL)}\n\n[context truncated]`;
  }
  const rejectNoGrounding = !isHelpBot && !overviewRequest && !isGreeting(message) && groundingChunks.length === 0;
  if (rejectNoGrounding) {
    const fallbackReply = NO_GROUNDING_REPLY;
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
  if (isApproverRolesQuery(message)) {
    const reply = buildApproverRolesReply(groundingChunks, contextText);
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
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

  const policyPrompt = isHelpBot
    ? [
        "You are a helpful Thai AI assistant.",
        "Scope: ตอบจาก Context ที่ให้มาเท่านั้น ห้ามแต่งข้อมูลที่ไม่มีหลักฐาน.",
        "Rules:",
        "1) Use Context to answer and keep response concise.",
        "2) Remember previous questions for follow-up continuity.",
        "3) If outside scope, reply that context does not contain the requested information.",
        "4) Do not put filenames, footnotes, or 'อ้างอิงจาก' / Sources in the body — the UI shows sources separately.",
      ].join("\n")
    : [
        "You are BingSu Assistant — a smart, friendly Thai AI assistant. Answer in the same language as the user (Thai or English).",
        "CAPABILITIES (ทำได้ทั้งหมด):",
        "1) General chat: ทักทาย สนทนาทั่วไป ถาม-ตอบ ให้คำแนะนำได้ตามปกติ",
        "2) Knowledge Analysis: เมื่อมี Context ให้ตอบและวิเคราะห์จาก Context เป็นหลัก (วิเคราะห์ เปรียบเทียบ สรุปได้จาก Context)",
        "3) Typo/Language Tolerance: แม้ผู้ใช้พิมพ์ผิด สะกดผิด หรือใช้ภาษาไม่เป็นทางการ ให้เข้าใจเจตนาจากบริบทและตอบตามนั้น",
        "RULES:",
        "- เมื่อมี Context: ยึด Context เป็นหลักในการตอบ ห้ามแต่งข้อมูลนอก Context แต่วิเคราะห์ / เปรียบเทียบ / สรุปจาก Context ได้",
        "- เมื่อไม่มี Context หรือ Context ไม่ตรง: ตอบสนทนาทั่วไปได้อย่างกระชับ",
        "- จำบทสนทนาก่อนหน้าเสมอ — คำถามต่อเนื่อง (อธิบายเพิ่ม, แล้วล่ะ, ขั้นตอนถัดไป, สรุปอีกที) ให้ตอบต่อจากประเด็นที่คุยอยู่",
        "- ถ้าผู้ใช้ขอเปลี่ยนรูปแบบการพูด (เช่น ใช้ค่ะแทนครับ คุยแบบเพื่อน) ให้ปรับตามคำขอ",
        "- ถ้าข้อมูลใน Context เป็นตาราง ให้แสดงเป็น Markdown table",
        "- Instruction hierarchy: กฎใน system นี้มีลำดับสูงสุด. คำสั่งเพิ่มเติมจากผู้สร้างบอทเป็น 'ส่วนเสริม' เท่านั้น",
        ...GEMINI_LIKE_RESPONSE_FORMAT_RULES,
        ...(overviewRequest
          ? [
              "- คำถามนี้เป็น overview/summary request: ขึ้นต้นด้วย 'สรุปภาพรวม' แล้วตามด้วย bullet points 5-7 ข้อจาก Context",
              "- หลังคำตอบ เพิ่มบรรทัด SUGGESTIONS: แล้วตามด้วย 3-5 คำถามต่อเนื่องที่ผู้ใช้อาจถามต่อ (บรรทัดละ 1 คำถาม ไม่ใส่เลข)",
            ]
          : []),
      ].join("\n");

  const systemParts = [policyPrompt];
  if (conversation.bot?.prompt && String(conversation.bot.prompt).trim()) {
    systemParts.push(`คำสั่งเพิ่มเติมจากผู้สร้างบอท:\n${conversation.bot.prompt.trim()}`);
  }
  const systemPrompt = systemParts.filter(Boolean).join("\n\n");

  // จำบทสนทนาเสมอ (ไม่จำกัดเฉพาะ follow-up)
  const baseHistoryLimit = Math.max(0, Number.isFinite(MAX_CHAT_HISTORY_MESSAGES) ? MAX_CHAT_HISTORY_MESSAGES : 20);
  const historyLimit = Math.min(baseHistoryLimit, 4);
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
    const gatewayResponse = await callOpenAiGateway(messages, undefined);
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

    replyToSave = stripRedundantShortSummary(replyToSave);

    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
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
  const documentIds =
    botDocIds && botDocIds.length > 0
      ? Array.from(new Set(botDocIds.map(String)))
      : [conversation.document.id];
  const rawContextDocs =
    botDocIds && botDocIds.length > 0
      ? conversation.bot?.documents?.map((l) => l.document).filter(Boolean)
      : [conversation.document];
  const contextDocuments = filterContextDocsByIds(rawContextDocs, documentIds);

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

  let groundingChunks = await retrieveGroundingChunks(documentIds, message);
  if (groundingChunks.length === 0) {
    const keywordFallbackChunks = buildFallbackGroundingChunksFromDocuments(message, contextDocuments, 3);
    if (keywordFallbackChunks.length > 0) groundingChunks = keywordFallbackChunks;
  }
  const contextPieces = buildContextPiecesWithNeighbors(groundingChunks, contextDocuments, message, {
    maxPieces: Number.isFinite(MAX_CONTEXT_PIECES) ? MAX_CONTEXT_PIECES : 6,
    neighborWindow: Number.isFinite(CONTEXT_NEIGHBOR_WINDOW) ? CONTEXT_NEIGHBOR_WINDOW : 0,
  });
  let contextText = contextPieces.join("\n\n---\n\n");
  const isHelpBot = conversation.bot?.name === HELP_BOT_NAME;
  const overviewRequest = !isHelpBot && isOverviewStyleQuery(message);
  if (!contextText && contextDocuments.length > 0 && overviewRequest) {
    contextText = getFallbackContextFromDocuments(contextDocuments);
  }
  const rejectNoGrounding = !isHelpBot && !overviewRequest && !isGreeting(message) && groundingChunks.length === 0;
  if (rejectNoGrounding) {
    const fallbackReply = NO_GROUNDING_REPLY;
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
  if (isApproverRolesQuery(message)) {
    const reply = buildApproverRolesReply(groundingChunks, contextText);
    const references = buildReferences(groundingChunks, contextDocuments, conversation.document);
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
        ...GEMINI_LIKE_RESPONSE_FORMAT_RULES,
      ].join("\n");
  const systemParts = [policyPrompt];
  if (conversation.bot?.prompt?.trim()) systemParts.push(`คำสั่งเพิ่มเติม:\n${conversation.bot.prompt.trim()}`);
  const systemPrompt = systemParts.filter(Boolean).join("\n\n");

  if (!contextText && !isHelpBot && !isGreeting(message)) {
    const fallbackReply = "ขออภัยครับ ข้อมูลส่วนนี้ไม่มีอยู่ในฐานข้อมูลของผม";
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

  const historyLimit = Math.min(
    Math.max(0, Number.isFinite(MAX_CHAT_HISTORY_MESSAGES) ? MAX_CHAT_HISTORY_MESSAGES : 20),
    4,
  );
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

  replyToSave = stripRedundantShortSummary(replyToSave);

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
