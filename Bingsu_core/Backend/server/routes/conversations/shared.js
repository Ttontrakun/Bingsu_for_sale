import { prisma } from "../../db.js";
import { authenticate, requireRole } from "../../lib/auth.js";
import { logEvent } from "../../lib/logging.js";
import { getNtCorpInternetPricingReply } from "../../services/ntCorpPricingDb.js";
import { getApprovalAuthorityReply } from "../../services/approvalAuthorityDb.js";
import { getProductManagerReply } from "../../services/productManagersDb.js";
import {
  cacheDel,
  cacheGet,
  cacheSet,
  conversationMessagesKey,
  invalidateConversationCaches,
  userCacheKey,
} from "../../lib/cache.js";
import { buildContextPiecesWithNeighbors, ensureSourceFileBlocks, getFallbackContextFromDocuments, filterContextDocsByIds, stripRedundantShortSummary, buildFallbackGroundingChunksFromDocuments, mergeHybridChunks } from "../../services/text.js";
import { retrieveGroundingChunks, retrieveGroundingGroups, invalidateRagCacheForDocument, invalidateAllRagCache } from "../../services/rag.js";
import { updateChunkText, replaceTextInDocument, deleteDocumentVectors, indexDocumentChunks } from "../../services/vectorDb.js";
import { callOpenAiGateway, callOpenAiGatewayStream, isGreeting, isGreetingOnly } from "../../services/chat.js";
import { getOrCreateUsageDaily } from "../../services/usage.js";
import { buildPersonalInfoWarning } from "../../lib/privacy.js";
import { CONTEXT_NEIGHBOR_WINDOW, FREE_DAILY_TOKEN_LIMIT, FREE_KNOWLEDGE_LIMIT, GREETING_REPLY, MAX_CHAT_HISTORY_MESSAGES, MAX_CONTEXT_PIECES, MAX_DAILY_CHAT_MESSAGES, openaiModel, deterministicRulesEnabled } from "../../config.js";
import {
  normalizeText,
  formatAuthorityRole,
  isAuthorityDecisionQuery,
  isAuthorityDetailFollowUpQuery,
  hasMultipleQuestions,
  isLikelyFollowUp,
  extractEvidenceTokens,
  isPricingIntent,
  isConsumerInternetPriceQuery,
  isUndergroundDarkFiberPriceQuery,
  isSystemCapabilityQuery,
  isDocumentListQuery,
  isCasualOffTopicQuery,
  isUnintelligibleQuery,
  isComparativeAuthorityQuery,
  isOverviewStyleQuery,
  isApproverRolesQuery,
  hasSufficientGroundingEvidence,
  isRememberOverrideRequest,
  extractRememberPayload,
  resolveChatThinkingMode,
} from "../../services/chat/queryClassifiers.js";
import {
  buildReferences,
  buildDocumentListReferences,
  PRIVATE_REFERENCE,
  flattenReferencesForCitations,
  buildCitationSystemMessage,
  stripInvalidCitationMarkers,
  buildReferencesForReply,
} from "../../services/chat/references.js";
import {
  NO_GROUNDING_REPLY,
  OUT_OF_SCOPE_REPLY,
  shouldOmitReferencesForReply,
  getDeterministicRuleReply,
  getAuthorityOverrideFromQuestion,
  getAuthorityOverrideFromReply,
  toCompactAuthorityReply,
  stripDocumentLeadIn,
  stripLatexToPlainText,
  getNoDataReply,
  shouldForceNoDataReply,
  getUnintelligibleReply,
  getSystemCapabilityReply,
  collectApproverAbbreviations,
  buildApproverRolesReply,
  buildRememberOverrideReply,
  buildPrivateRememberConfirmReply,
  buildAuthoritativeFactPrompt,
} from "../../services/chat/authorityReplies.js";
import {
  GROUNDING_FACT_RULES,
  GEMINI_LIKE_RESPONSE_FORMAT_RULES,
  getResponseFormatRulesForMessage,
  buildPolicyPrompt,
  getHelpBotSystemKnowledge,
} from "../../services/chat/policyPrompt.js";
import {
  isAuthoritySourceDocument,
  resolveAuthorityDocIds,
  resolveRetrievalTargets,
  buildStandaloneQuery,
  getPreviousUserQuestionForRetrieval,
  resolveGroundingChunks,
} from "../../services/chat/retrieval.js";

export {
  prisma,
  authenticate,
  requireRole,
  logEvent,
  getNtCorpInternetPricingReply,
  getApprovalAuthorityReply,
  getProductManagerReply,
  cacheDel,
  cacheGet,
  cacheSet,
  conversationMessagesKey,
  invalidateConversationCaches,
  userCacheKey,
  buildContextPiecesWithNeighbors,
  ensureSourceFileBlocks,
  getFallbackContextFromDocuments,
  filterContextDocsByIds,
  stripRedundantShortSummary,
  buildFallbackGroundingChunksFromDocuments,
  mergeHybridChunks,
  retrieveGroundingChunks,
  retrieveGroundingGroups,
  invalidateRagCacheForDocument,
  invalidateAllRagCache,
  updateChunkText,
  replaceTextInDocument,
  deleteDocumentVectors,
  indexDocumentChunks,
  callOpenAiGateway,
  callOpenAiGatewayStream,
  isGreeting,
  isGreetingOnly,
  getOrCreateUsageDaily,
  buildPersonalInfoWarning,
  CONTEXT_NEIGHBOR_WINDOW,
  FREE_DAILY_TOKEN_LIMIT,
  FREE_KNOWLEDGE_LIMIT,
  GREETING_REPLY,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CONTEXT_PIECES,
  MAX_DAILY_CHAT_MESSAGES,
  openaiModel,
  deterministicRulesEnabled,
  normalizeText,
  formatAuthorityRole,
  isAuthorityDecisionQuery,
  isAuthorityDetailFollowUpQuery,
  hasMultipleQuestions,
  isLikelyFollowUp,
  extractEvidenceTokens,
  isPricingIntent,
  isConsumerInternetPriceQuery,
  isUndergroundDarkFiberPriceQuery,
  isSystemCapabilityQuery,
  isDocumentListQuery,
  isCasualOffTopicQuery,
  isUnintelligibleQuery,
  isComparativeAuthorityQuery,
  isOverviewStyleQuery,
  isApproverRolesQuery,
  hasSufficientGroundingEvidence,
  isRememberOverrideRequest,
  extractRememberPayload,
  resolveChatThinkingMode,
  buildReferences,
  buildDocumentListReferences,
  PRIVATE_REFERENCE,
  flattenReferencesForCitations,
  buildCitationSystemMessage,
  stripInvalidCitationMarkers,
  buildReferencesForReply,
  NO_GROUNDING_REPLY,
  OUT_OF_SCOPE_REPLY,
  shouldOmitReferencesForReply,
  getDeterministicRuleReply,
  getAuthorityOverrideFromQuestion,
  getAuthorityOverrideFromReply,
  toCompactAuthorityReply,
  stripDocumentLeadIn,
  stripLatexToPlainText,
  getNoDataReply,
  shouldForceNoDataReply,
  getUnintelligibleReply,
  getSystemCapabilityReply,
  collectApproverAbbreviations,
  buildApproverRolesReply,
  buildRememberOverrideReply,
  buildPrivateRememberConfirmReply,
  buildAuthoritativeFactPrompt,
  GROUNDING_FACT_RULES,
  GEMINI_LIKE_RESPONSE_FORMAT_RULES,
  getResponseFormatRulesForMessage,
  buildPolicyPrompt,
  getHelpBotSystemKnowledge,
  isAuthoritySourceDocument,
  resolveAuthorityDocIds,
  resolveRetrievalTargets,
  buildStandaloneQuery,
  getPreviousUserQuestionForRetrieval,
  resolveGroundingChunks
};

export const MAX_PRIVATE_CONTEXT_CHARS = Number(process.env.MAX_PRIVATE_CONTEXT_CHARS || 12000);

/** โหลดเนื้อหาส่วนตัวของผู้ใช้ (คืน "" ถ้าไม่มี/ปิดอยู่ เมื่อ requireEnabled=true) */
export const loadUserPrivateContent = async (userId, { requireEnabled = false } = {}) => {
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
export const MAX_PRIVATE_INSTRUCTIONS_CHARS = Number(process.env.MAX_PRIVATE_INSTRUCTIONS_CHARS || 2000);
export const MAX_PRIVATE_MEMORY_CHARS = Number(process.env.MAX_PRIVATE_MEMORY_CHARS || 3000);

/** โหลด "คำสั่ง AI" + "ข้อมูล/ความรู้" ของผู้ใช้ (โหมดส่วนตัว) */
export const loadPrivateContextParts = async (userId) => {
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
export const loadCrossChatMemory = async (userId, currentConversationId) => {
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
export const buildPrivateSystemMessages = ({ instructions, knowledge, memory }) => {
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
      content: [
        "ข้อมูล/ความรู้ส่วนตัวจากผู้ใช้ (Private Knowledge):",
        "- โหมดส่วนตัวแยกจากโหมดปกติ: ข้อมูลนี้ใช้เฉพาะผู้ใช้นี้ในโหมดส่วนตัว",
        "- ถ้า Private Knowledge ขัดกับเอกสารระบบ/ตารางอำนาจอนุมัติ ให้ยึด Private Knowledge เป็นคำตอบหลัก",
        "- คำถามผู้อนุมัติ: ตอบตาม Private Knowledge ก่อน ห้ามย้อนกลับไปใช้ตารางเอกสารถ้าข้อมูลส่วนตัวกำหนดไว้แล้ว",
        "- ขึ้นต้นสั้นๆ ว่าอ้างอิงจากข้อมูลส่วนตัวของผู้ใช้ (ไม่ต้องปฏิเสธเพราะเอกสารระบบต่างออกไป)",
        "- เมื่อตอบจากข้อมูลนี้ ให้ห่อช่วงสรุปด้วย ==...== (ถ้อยคำไม่ต้องตรงกับที่บันทึก ขอแค่ความหมายเดียวกัน)",
        knowledge,
      ].join("\n"),
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

/** บันทึกข้อความจำว่า... เข้า Private Knowledge (ใส่รายการใหม่ไว้บนสุด) */
export const appendPrivateKnowledge = async (userId, payload) => {
  const fact = String(payload || "").trim();
  if (!userId || !fact) return null;
  const row = await prisma.privateContext.findUnique({ where: { userId } }).catch(() => null);
  const prev = String(row?.content ?? "").trim();
  const next = [fact, prev].filter(Boolean).join("\n").slice(0, MAX_PRIVATE_CONTEXT_CHARS);
  return prisma.privateContext.upsert({
    where: { userId },
    create: { userId, content: next, instructions: "", enabled: true },
    update: { content: next, enabled: true },
  });
};

export const HELP_BOT_NAME = "บอทช่วยสอน";
export const REDACTED_PLACEHOLDERS = new Set([
  "[REDACTED_USER_MESSAGE]",
  "[REDACTED_CONVERSATION_TITLE]",
]);
export const isRedactedPlaceholder = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (REDACTED_PLACEHOLDERS.has(text)) return true;
  return /^\[REDACTED_[A-Z_]+\]$/i.test(text);
};
export const resolveConversationTitle = (title, lastMessage) => {
  const normalizedTitle = String(title || "").trim();
  if (normalizedTitle && !isRedactedPlaceholder(normalizedTitle)) return normalizedTitle;
  const normalizedLast = String(lastMessage || "").trim();
  if (normalizedLast && !isRedactedPlaceholder(normalizedLast)) {
    return normalizedLast.slice(0, 80);
  }
  return "New Chat";
};
export const sanitizeRedactedContentForClient = (content) => {
  const normalized = String(content || "").trim();
  if (isRedactedPlaceholder(normalized)) return "";
  return content;
};
/* analysis-feature edits: query-rewriting, multi-question, grounding */
/**
 * ประกอบ context แบบแยกบล็อกตามคำถาม (sectioned) สำหรับโหมดหลายคำถาม
 * แต่ละข้อได้บล็อกป้ายกำกับของตัวเอง เพื่อให้โมเดลไม่สับสนว่าข้อมูล/เลขคำสั่งชิ้นไหนของข้อไหน
 */
export const buildSectionedContext = (groups, perQuestionPieces = 5) => {
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

// helper ฝั่งอ้างอิง/นโยบาย/ตัวจำแนกคำถาม ถูกย้ายไป server/services/chat/* (ดู import ด้านบน)

export const PLATFORM_VALUES = new Set(["line", "messenger", "website", "api", "sandbox"]);
export const getPlatform = (req) => {
  const raw = req.headers["x-client-platform"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = String(value || "").trim().toLowerCase();
  return PLATFORM_VALUES.has(normalized) ? normalized : "website";
};

export const coerceInt = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
};

export const getTokenUsage = (gatewayResponse) => {
  const usage = gatewayResponse?.usage || {};
  return {
    promptTokens: coerceInt(usage.prompt_tokens ?? usage.promptTokens),
    completionTokens: coerceInt(usage.completion_tokens ?? usage.completionTokens),
    totalTokens: coerceInt(usage.total_tokens ?? usage.totalTokens),
  };
};

export const getUsedTokensFromRow = (row) => {
  const t = Number(row?.totalTokens || 0);
  if (Number.isFinite(t) && t > 0) return t;
  const p = Number(row?.promptTokens || 0);
  const c = Number(row?.completionTokens || 0);
  return (Number.isFinite(p) ? p : 0) + (Number.isFinite(c) ? c : 0);
};


export const MAX_CONTEXT_CHARS_FOR_MODEL = Number(process.env.MAX_CONTEXT_CHARS_FOR_MODEL || 12000);

export async function applyCorrectionToKnowledge(message, correction) {
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
export async function applyCorrectionToVectorDb(documentIds, correction) {
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

export const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const normalizeForMatch = (value) => String(value || "").replace(/\s+/g, " ").trim();
export const buildLooseWhitespaceRegex = (fromStr) => {
  const normalized = normalizeForMatch(fromStr);
  if (!normalized) return null;
  const pattern = normalized
    .split(/\s+/)
    .map((token) => escapeRegExp(token))
    .join("\\s+");
  return new RegExp(pattern, "g");
};

export const replaceTextFlexible = (text, fromStr, toStr) => {
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
export async function applyCorrectionToDocumentSourceFiles(documentIds, correction) {
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


export const DOCUMENT_SCOPE_FOLLOWUPS = [
  "มีเอกสารอะไรบ้าง",
  "สรุปภาพรวมเอกสารที่เลือก",
  "ถามเรื่องราคา ส่วนลด หรืออำนาจอนุมัติได้ไหม",
];

export const LINE_PLATFORM = "line";
