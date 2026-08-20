import express from "express";
import { prisma } from "../db.js";
import { authenticate } from "../lib/auth.js";
import { logEvent } from "../lib/logging.js";
import { getNtCorpInternetPricingReply } from "../services/ntCorpPricingDb.js";
import { getApprovalAuthorityReply } from "../services/approvalAuthorityDb.js";
import { getProductManagerReply } from "../services/productManagersDb.js";
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
} from "../services/chat/queryClassifiers.js";
import {
  buildReferences,
  PRIVATE_REFERENCE,
  flattenReferencesForCitations,
  buildCitationSystemMessage,
  stripInvalidCitationMarkers,
  buildReferencesForReply,
} from "../services/chat/references.js";
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
} from "../services/chat/authorityReplies.js";
import {
  GROUNDING_FACT_RULES,
  GEMINI_LIKE_RESPONSE_FORMAT_RULES,
  getResponseFormatRulesForMessage,
  buildPolicyPrompt,
  getHelpBotSystemKnowledge,
} from "../services/chat/policyPrompt.js";
import {
  isAuthoritySourceDocument,
  resolveAuthorityDocIds,
  resolveRetrievalTargets,
  buildStandaloneQuery,
  getPreviousUserQuestionForRetrieval,
  resolveGroundingChunks,
} from "../services/chat/retrieval.js";

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
const appendPrivateKnowledge = async (userId, payload) => {
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

// helper ฝั่งอ้างอิง/นโยบาย/ตัวจำแนกคำถาม ถูกย้ายไป server/services/chat/* (ดู import ด้านบน)

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


const MAX_CONTEXT_CHARS_FOR_MODEL = Number(process.env.MAX_CONTEXT_CHARS_FOR_MODEL || 12000);

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
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
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
    pinned: conversation.pinned === true,
    document: conversation.document,
    bot: conversation.bot,
    lastMessage: sanitizeRedactedContentForClient(conversation.messages[0]?.content) ?? null,
  }));
  res.json(payload);
  await cacheSet(cacheKey, payload);
});

conversationsRouter.delete("/", authenticate, async (req, res) => {
  // แชทที่ปักหมุดจะไม่ถูกลบ จนกว่าผู้ใช้จะเลิกปักหมุดเอง
  await prisma.conversation.deleteMany({
    where: { userId: req.user.id, pinned: false },
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

  if (conversation.pinned === true) {
    res.status(409).json({ error: "แชทนี้ปักหมุดอยู่ — เลิกปักหมุดก่อนจึงจะลบได้" });
    return;
  }

  await prisma.conversation.delete({ where: { id: conversation.id } });
  res.json({ ok: true });
  await invalidateConversationCaches(conversation.id, req.user.id);
});

// แก้ไขข้อความผู้ใช้แบบ Gemini: ลบข้อความนี้และข้อความทั้งหมดที่มาทีหลัง
// เพื่อให้ branch ใหม่แทนที่ของเดิม (history ของโมเดลจะไม่เห็นคำตอบเก่า)
conversationsRouter.delete("/:id/messages/:messageId/from-here", authenticate, async (req, res) => {
  const conversationId = req.params.id;
  const messageId = req.params.messageId;
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: req.user.id },
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
  if (message.role !== "user") {
    res.status(400).json({ error: "ตัดข้อความได้เฉพาะข้อความของผู้ใช้" });
    return;
  }
  const deleted = await prisma.message.deleteMany({
    where: {
      conversationId: conversation.id,
      createdAt: { gte: message.createdAt },
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });
  await invalidateConversationCaches(conversation.id, req.user.id);
  res.json({ ok: true, deleted: deleted.count });
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
  const { title, pinned, botId, documentId } = req.body ?? {};
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const data = {
    title: typeof title === "string" ? title.trim().slice(0, 255) : undefined,
    pinned: typeof pinned === "boolean" ? pinned : undefined,
  };

  if (botId !== undefined) {
    if (typeof botId !== "string" || !botId.trim()) {
      res.status(400).json({ error: "botId is required" });
      return;
    }
    const bot = await prisma.bot.findFirst({
      where: {
        id: botId,
        enabled: { not: false },
        OR: [
          { ownerId: req.user.id },
          { name: "Enterprise AI Chatbot Assistant" },
          { name: "บอทช่วยสอน" },
        ],
      },
      include: {
        documents: { select: { documentId: true }, take: 1 },
      },
    });
    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }
    data.botId = bot.id;
    if (documentId === undefined) {
      const fallbackDocId = bot.documents?.[0]?.documentId;
      if (fallbackDocId) data.documentId = fallbackDocId;
    }
  }

  if (documentId !== undefined) {
    if (typeof documentId !== "string" || !documentId.trim()) {
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
      select: { id: true },
    });
    if (!document) {
      const helpDoc = await prisma.document.findFirst({
        where: { id: documentId, displayName: "คู่มือการใช้งาน" },
        select: { id: true },
      });
      if (helpDoc) document = helpDoc;
    }
    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    data.documentId = document.id;
  }

  if (
    data.title === undefined &&
    data.pinned === undefined &&
    data.botId === undefined &&
    data.documentId === undefined
  ) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data,
  });
  res.json(updated);
  await invalidateConversationCaches(conversation.id, req.user.id);
});

/**
 * สร้างคำถามต่อเนื่อง (follow-up suggestions) จากคำถาม-คำตอบล่าสุด — ใช้โมเดลเล็ก (mode fast)
 * คืน { suggestions: ["คำถาม 1", ...] } สูงสุด 3 ข้อ ถ้า LLM ล้มเหลวคืน [] (frontend มี fallback เอง)
 */
const DOCUMENT_SCOPE_FOLLOWUPS = [
  "มีเอกสารอะไรบ้าง",
  "สรุปภาพรวมเอกสารที่เลือก",
  "ถามเรื่องราคา ส่วนลด หรืออำนาจอนุมัติได้ไหม",
];

conversationsRouter.post("/:id/followup-suggestions", authenticate, async (req, res) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: { id: true },
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const question = String(req.body?.question || "").trim().slice(0, 2000);
  const answer = String(req.body?.answer || "").trim().slice(0, 6000);
  const messageId = String(req.body?.messageId || "").trim();
  const persistSuggestions = async (items) => {
    const list = Array.isArray(items) ? items.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 5) : [];
    if (!messageId || list.length === 0) return list;
    try {
      const target = await prisma.message.findFirst({
        where: { id: messageId, conversationId: conversation.id, role: "model" },
        select: { id: true },
      });
      if (target) {
        await prisma.message.update({
          where: { id: target.id },
          data: { suggestions: list },
        });
        await invalidateConversationCaches(conversation.id, req.user.id);
      }
    } catch (err) {
      console.warn("[conversations] persist followup suggestions failed:", err?.message || err);
    }
    return list;
  };
  if (!answer) {
    res.json({ suggestions: [] });
    return;
  }
  // คำถาม/คำตอบนอกขอบเขต — อย่าให้ LLM ต่อยอดเป็นเมนูอาหาร/ช้อปปิ้ง ฯลฯ; ชี้กลับไปถามเอกสาร
  if (shouldOmitReferencesForReply(answer) || isCasualOffTopicQuery(question)) {
    const suggestions = await persistSuggestions(DOCUMENT_SCOPE_FOLLOWUPS);
    res.json({ suggestions });
    return;
  }
  try {
    const data = await callOpenAiGateway(
      [
        {
          role: "system",
          content:
            'คุณคือผู้ช่วยเสนอคำถามต่อเนื่องสำหรับระบบแชทเอกสารองค์กร ตอบเป็น JSON array ของ string เท่านั้น เช่น ["คำถาม 1","คำถาม 2","คำถาม 3"] ห้ามมีข้อความอื่นนอก JSON',
        },
        {
          role: "user",
          content:
            `จากบทสนทนานี้ ให้เสนอคำถามต่อเนื่องที่ผู้ใช้น่าจะอยากถามต่อ 3 ข้อ\n` +
            `เงื่อนไข: เป็นภาษาไทย สั้นกระชับไม่เกิน 60 ตัวอักษรต่อข้อ ` +
            `ต้องเกี่ยวกับเนื้อหาในเอกสารองค์กรเท่านั้น (ราคา ค่าบริการ ส่วนลด อำนาจอนุมัติ ขั้นตอนตามเอกสาร) ` +
            `ห้ามเสนอคำถามชีวิตประจำวัน อาหาร ท่องเที่ยว ช้อปปิ้ง หรือหัวข้อนอกเอกสาร ` +
            `ไม่ถามซ้ำกับคำถามเดิม และต้องเป็นคำถามที่ตอบได้จากเอกสาร/บริบทเดิม\n\n` +
            (question ? `คำถามของผู้ใช้: ${question}\n\n` : "") +
            `คำตอบของระบบ:\n${answer}`,
        },
      ],
      undefined,
      "fast",
      "fast",
    );
    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    let suggestions = [];
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(match ? match[0] : raw);
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, 3);
      }
    } catch {
      // รูปแบบไม่ใช่ JSON: ดึงจากบรรทัด (กันเคสโมเดลตอบเป็นลิสต์ธรรมดา)
      suggestions = raw
        .split("\n")
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter((line) => line.length >= 5 && line.length <= 120)
        .slice(0, 3);
    }
    suggestions = await persistSuggestions(suggestions);
    res.json({ suggestions });
  } catch (error) {
    console.warn("[conversations] followup-suggestions failed:", error?.message || error);
    res.json({ suggestions: [] });
  }
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

  const botDocsForList = (conversation.bot?.documents || []).map((l) => l.document).filter(Boolean);
  const capabilityDocs = botDocsForList.length > 0
    ? botDocsForList
    : (conversation.document ? [conversation.document] : []);

  // ลิสต์เอกสาร/ฟีเจอร์ระบบ — ตัดก่อน retrieval กัน RAG ไปตอบเนื้อหาเรื่องเอกสารแนบในไฟล์
  if (isDocumentListQuery(message) || isSystemCapabilityQuery(message)) {
    const capabilityReply = getSystemCapabilityReply(capabilityDocs, message);
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
    res.write(`data: ${JSON.stringify({ content: capabilityReply })}\n\n`);
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

  // นอกเอกสารชัดเจน (อาหาร/อากาศ ฯลฯ) — ปฏิเสธก่อน retrieval; โหมดส่วนตัว/บอทช่วยสอนยกเว้น
  if (
    !hasPrivateContext
    && conversation.bot?.name !== HELP_BOT_NAME
    && isCasualOffTopicQuery(message)
  ) {
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: { conversationId, role: "model", content: OUT_OF_SCOPE_REPLY, platform: getPlatform(req) },
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
    res.write(`data: ${JSON.stringify({ content: OUT_OF_SCOPE_REPLY })}\n\n`);
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: OUT_OF_SCOPE_REPLY,
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
  // โหมดส่วนตัว: ไม่ใช้ตารางอำนาจ/hardcode ระบบ — ให้ยึด Private Knowledge ของผู้ใช้
  const approvalAuthorityReply = privateMode ? null : await getApprovalAuthorityReply(message);
  const productManagerReply = privateMode ? null : await getProductManagerReply(message);
  // โหมดปกติ: ขอให้จำ/ทับเอกสาร → ชี้ไปโหมดส่วนตัว + ยึดเอกสาร (ไม่เอออ่อว่าจำได้)
  let rememberGuidanceReply = null;
  let privateRememberReply = null;
  if (!isHelpBot && isRememberOverrideRequest(message)) {
    if (privateMode) {
      const payload = extractRememberPayload(message);
      if (payload) {
        await appendPrivateKnowledge(req.user.id, payload).catch((err) => {
          console.warn("[private-remember] save failed:", err?.message || err);
        });
        privateRememberReply = buildPrivateRememberConfirmReply(payload);
      }
    } else {
      rememberGuidanceReply = buildRememberOverrideReply(
        message,
        groundingChunks,
        getAuthorityOverrideFromQuestion(message),
      );
    }
  }
  const deterministicReply = ntPricingReply
    || privateRememberReply
    || rememberGuidanceReply
    || approvalAuthorityReply
    || (!privateMode && deterministicRulesEnabled ? getDeterministicRuleReply(message) : null)
    || productManagerReply;
  // คำตอบสำเร็จรูป: ตัดจบตรงๆ เฉพาะยืนยัน /จำ (ต้องคง ==ไฮไลต์==)
  // นอกนั้นส่งเป็นข้อเท็จจริงให้โมเดลเรียบเรียงเอง
  if (privateRememberReply) {
    const references = [PRIVATE_REFERENCE];
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: privateRememberReply,
        groundingChunks: groundingChunks ?? undefined,
        references,
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
    try { res.socket?.setNoDelay?.(true); } catch (_) {}
    const detSleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const DET_CHUNK = 4;
    for (let i = 0; i < privateRememberReply.length; i += DET_CHUNK) {
      res.write(`data: ${JSON.stringify({ content: privateRememberReply.slice(i, i + DET_CHUNK) })}\n\n`);
      if (typeof res.flush === "function") res.flush();
      await detSleep(22);
    }
    res.write(
      `data: ${JSON.stringify({
        done: true,
        messageId: modelMessage.id,
        reply: privateRememberReply,
        references,
        groundingChunks: groundingChunks ?? [],
      })}\n\n`,
    );
    res.end();
    return;
  }
  const hasEvidence = hasSufficientGroundingEvidence(message, groundingChunks);
  const casualOffTopic = !isHelpBot && !hasPrivateContext && isCasualOffTopicQuery(message);
  // คุยเล่นนอกเอกสาร = ตัดเสมอ (แม้ follow-up); อื่นๆ ต้องมี grounding ยกเว้น follow-up เชิงเอกสาร
  const rejectNoGrounding = !isHelpBot && !overviewRequest
    && !deterministicReply
    && !hasPrivateContext
    && (
      casualOffTopic
      || (!followUpIntent && (groundingChunks.length === 0 || !hasEvidence))
    );
  if (rejectNoGrounding) {
    const fallbackReply = casualOffTopic ? OUT_OF_SCOPE_REPLY : getNoDataReply(message);
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
    res.write(`data: ${JSON.stringify({ content: fallbackReply })}\n\n`);
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
  if (privateMode || hasPrivateContext) {
    systemParts.push(
      [
        "โหมดส่วนตัว (แยกจากโหมดปกติ):",
        "- โหมดปกติยึดเอกสารระบบเท่านั้น; โหมดส่วนตัวให้ผู้ใช้แก้/ทับข้อมูลสำหรับตัวเองได้",
        "- ถ้ามี Private Knowledge/คำสั่งส่วนตัวที่ขัดกับเอกสารระบบหรือตารางอำนาจ ให้ยึดข้อมูลส่วนตัวเป็นคำตอบหลัก",
        "- คำถามเรื่องผู้อนุมัติ/อำนาจอนุมัติ: ถ้า Private Knowledge กำหนดผู้อนุมัติไว้ ให้ตอบตามข้อมูลส่วนตัวทันที ห้ามเปลี่ยนไปตอบตามตารางเอกสารตอนท้าย",
        "- ห้ามตอบด้วยตารางอำนาจระบบเมื่อผู้ใช้กำหนดผู้อนุมัติไว้ใน Private Knowledge แล้ว",
        "- ห้ามตอบว่าไม่พบข้อมูลถ้าตอบได้จากข้อมูลส่วนตัวหรือความจำข้ามแชท",
        "- เมื่อขัดกับเอกสารระบบ บอกสั้นๆ ว่าใช้ข้อมูลส่วนตัวของผู้ใช้ (โหมดส่วนตัว) ไม่กระทบโหมดปกติ",
        "- ข้อความที่สรุป/อ้างจาก Private Knowledge ต้องห่อด้วย ==...== เพื่อให้ UI ไฮไลต์ม่วง (ห้ามใส่เลข [n])",
        "- ไม่จำเป็นต้องคัดลอกข้อความใน /จำ ตรงตัว — ถ้อยคำต่างกันได้ ขอแค่ความหมายมาจากข้อมูลส่วนตัวก็ห่อ == ได้",
        "- ห้ามห่อข้อความที่มาจากเอกสารระบบด้วย ==...==",
      ].join("\n"),
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
  // คำนวณรายการอ้างอิงล่วงหน้า (แสดงเป็นการ์ดใต้คำตอบ — ไม่ฉีดเลข [n] ในเนื้อความ)
  const citationReferences = flattenReferencesForCitations(
    buildReferencesForReply({
      groundingChunks,
      contextDocuments,
      primaryDocument: conversation.document,
      message,
      hasPrivateContext,
    }),
  );
  const citationSystemMessage = buildCitationSystemMessage(citationReferences);
  const contextLabel = isHelpBot ? "Context (from user guide)" : "Context";
  // หลังบันทึกจำว่า... ในรอบนี้ ให้ฉีด payload เข้า Private Knowledge ทันที (ยังไม่ reload จาก DB)
  const knowledgeForPrompt = privateRememberReply
    ? [extractRememberPayload(message), privateKnowledge].filter(Boolean).join("\n")
    : privateKnowledge;
  const messages = [
    { role: "system", content: systemPrompt },
    ...(contextText ? [{ role: "system", content: `${contextLabel}:\n${contextText}` }] : []),
    ...(citationSystemMessage ? [citationSystemMessage] : []),
    ...(deterministicReply
      ? [{
          role: "system",
          content: buildAuthoritativeFactPrompt(deterministicReply),
        }]
      : []),
    ...(isComparativeAuthorityQuery(message)
      ? [{
          role: "system",
          content: "คำถามนี้เป็นการเปรียบเทียบหลายกรณี ให้ตอบแยกทีละกรณีตามเงื่อนไขตัวเลขในคำถาม และถ้าข้อมูลไม่ครบให้ระบุว่ากรณีใดไม่พบหลักฐาน",
        }]
      : []),
    ...historyMessages,
    // Private Knowledge ไว้ใกล้ข้อความผู้ใช้ เพื่อไม่ให้ตารางเอกสารทับตอนตอบ
    ...buildPrivateSystemMessages({ instructions: privateInstructions, knowledge: knowledgeForPrompt, memory: privateMemory }),
    { role: "user", content: message },
  ];

  try {
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });

    const thinkingMode = resolveChatThinkingMode(message, {
      forceFast: req.body?.mode === "fast" || req.body?.thinkingMode === "fast",
      forceThink: req.body?.thinkingMode === "think",
    });
    const streamBody = await callOpenAiGatewayStream(
      messages,
      conversation.bot?.model || undefined,
      req.body?.mode === "fast" ? "fast" : undefined,
      thinkingMode,
    );
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
    replyToSave = stripLatexToPlainText(replyToSave);
    replyToSave = stripRedundantShortSummary(replyToSave);
    replyToSave = toCompactAuthorityReply(message, replyToSave, {
      respectPrivate: hasPrivateContext,
    });

    // ถ้าโมเดลตอบนอกขอบเขต/ไม่พบข้อมูล — อย่าแปะการ์ดเอกสารจาก retrieval top-k
    const references = shouldOmitReferencesForReply(replyToSave) ? [] : citationReferences;
    replyToSave = stripInvalidCitationMarkers(replyToSave, references.length);
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: replyToSave,
        groundingChunks: references.length > 0 ? (groundingChunks ?? undefined) : undefined,
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
      const references = citationReferences;
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

  const botDocsForListNonStream = (conversation.bot?.documents || []).map((l) => l.document).filter(Boolean);
  const capabilityDocsNonStream = botDocsForListNonStream.length > 0
    ? botDocsForListNonStream
    : (conversation.document ? [conversation.document] : []);
  if (isDocumentListQuery(message) || isSystemCapabilityQuery(message)) {
    const capabilityReply = getSystemCapabilityReply(capabilityDocsNonStream, message);
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

  if (
    !hasPrivateContext
    && conversation.bot?.name !== HELP_BOT_NAME
    && isCasualOffTopicQuery(message)
  ) {
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
        content: OUT_OF_SCOPE_REPLY,
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
      reply: OUT_OF_SCOPE_REPLY,
      groundingChunks: [],
      references: [],
      messageId: modelMessage.id,
    });
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
  const approvalAuthorityReply = privateMode ? null : await getApprovalAuthorityReply(message);
  const productManagerReply = privateMode ? null : await getProductManagerReply(message);
  let rememberGuidanceReply = null;
  let privateRememberReply = null;
  if (!isHelpBot && isRememberOverrideRequest(message)) {
    if (privateMode) {
      const payload = extractRememberPayload(message);
      if (payload) {
        await appendPrivateKnowledge(req.user.id, payload).catch((err) => {
          console.warn("[private-remember] save failed:", err?.message || err);
        });
        privateRememberReply = buildPrivateRememberConfirmReply(payload);
      }
    } else {
      rememberGuidanceReply = buildRememberOverrideReply(
        message,
        groundingChunks,
        getAuthorityOverrideFromQuestion(message),
      );
    }
  }
  const deterministicReply = ntPricingReply
    || privateRememberReply
    || rememberGuidanceReply
    || approvalAuthorityReply
    || (!privateMode && deterministicRulesEnabled ? getDeterministicRuleReply(message) : null)
    || productManagerReply;
  // คำตอบสำเร็จรูป: ตัดจบตรงๆ เฉพาะยืนยัน /จำ (ต้องคง ==ไฮไลต์==)
  // นอกนั้นส่งเป็นข้อเท็จจริงให้โมเดลเรียบเรียงเอง
  if (privateRememberReply) {
    const references = [PRIVATE_REFERENCE];
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
    });
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: privateRememberReply,
        groundingChunks: groundingChunks ?? undefined,
        references,
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
      reply: privateRememberReply,
      groundingChunks: modelMessage.groundingChunks ?? [],
      references,
      messageId: modelMessage.id,
    });
    await invalidateConversationCaches(conversation.id, req.user.id);
    return;
  }
  const hasEvidence = hasSufficientGroundingEvidence(message, groundingChunks);
  const casualOffTopic = !isHelpBot && !hasPrivateContext && isCasualOffTopicQuery(message);
  const rejectNoGrounding = !isHelpBot && !overviewRequest
    && !deterministicReply
    && !hasPrivateContext
    && (
      casualOffTopic
      || (!followUpIntent && (groundingChunks.length === 0 || !hasEvidence))
    );
  if (rejectNoGrounding) {
    const fallbackReply = casualOffTopic ? OUT_OF_SCOPE_REPLY : getNoDataReply(message);
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
  if (privateMode || hasPrivateContext) {
    systemParts.push(
      [
        "โหมดส่วนตัว (แยกจากโหมดปกติ):",
        "- โหมดปกติยึดเอกสารระบบเท่านั้น; โหมดส่วนตัวให้ผู้ใช้แก้/ทับข้อมูลสำหรับตัวเองได้",
        "- ถ้ามี Private Knowledge/คำสั่งส่วนตัวที่ขัดกับเอกสารระบบหรือตารางอำนาจ ให้ยึดข้อมูลส่วนตัวเป็นคำตอบหลัก",
        "- คำถามเรื่องผู้อนุมัติ/อำนาจอนุมัติ: ถ้า Private Knowledge กำหนดผู้อนุมัติไว้ ให้ตอบตามข้อมูลส่วนตัวทันที ห้ามเปลี่ยนไปตอบตามตารางเอกสารตอนท้าย",
        "- ห้ามตอบด้วยตารางอำนาจระบบเมื่อผู้ใช้กำหนดผู้อนุมัติไว้ใน Private Knowledge แล้ว",
        "- ห้ามตอบว่าไม่พบข้อมูลถ้าตอบได้จากข้อมูลส่วนตัวหรือความจำข้ามแชท",
        "- เมื่อขัดกับเอกสารระบบ บอกสั้นๆ ว่าใช้ข้อมูลส่วนตัวของผู้ใช้ (โหมดส่วนตัว) ไม่กระทบโหมดปกติ",
        "- ข้อความที่สรุป/อ้างจาก Private Knowledge ต้องห่อด้วย ==...== เพื่อให้ UI ไฮไลต์ม่วง (ห้ามใส่เลข [n])",
        "- ไม่จำเป็นต้องคัดลอกข้อความใน /จำ ตรงตัว — ถ้อยคำต่างกันได้ ขอแค่ความหมายมาจากข้อมูลส่วนตัวก็ห่อ == ได้",
        "- ห้ามห่อข้อความที่มาจากเอกสารระบบด้วย ==...==",
      ].join("\n"),
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

  // คำนวณรายการอ้างอิงล่วงหน้า สำหรับการ์ดใต้คำตอบ (ไม่ใช้เลข [n] ในเนื้อความ)
  const citationReferences = flattenReferencesForCitations(
    buildReferencesForReply({
      groundingChunks,
      contextDocuments,
      primaryDocument: conversation.document,
      message,
      hasPrivateContext,
    }),
  );
  const citationSystemMessage = buildCitationSystemMessage(citationReferences);
  const contextLabel = isHelpBot ? "Context (from user guide)" : "Context";
  const knowledgeForPrompt = privateRememberReply
    ? [extractRememberPayload(message), privateKnowledge].filter(Boolean).join("\n")
    : privateKnowledge;
  const messages = [
    { role: "system", content: systemPrompt },
    ...(contextText ? [{ role: "system", content: `${contextLabel}:\n${contextText}` }] : []),
    ...(citationSystemMessage ? [citationSystemMessage] : []),
    ...(deterministicReply
      ? [{
          role: "system",
          content: buildAuthoritativeFactPrompt(deterministicReply),
        }]
      : []),
    ...(isComparativeAuthorityQuery(message)
      ? [{
          role: "system",
          content: "คำถามนี้เป็นการเปรียบเทียบหลายกรณี ให้ตอบแยกทีละกรณีตามเงื่อนไขตัวเลขในคำถาม และถ้าข้อมูลไม่ครบให้ระบุว่ากรณีใดไม่พบหลักฐาน",
        }]
      : []),
    ...historyMessages,
    // Private Knowledge ไว้ใกล้ข้อความผู้ใช้ เพื่อไม่ให้ตารางเอกสารทับตอนตอบ
    ...buildPrivateSystemMessages({ instructions: privateInstructions, knowledge: knowledgeForPrompt, memory: privateMemory }),
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

    // ใช้ Bot.model ถ้าแอดมินเลือกไว้ — ว่าง = OPENAI_MODEL จาก .env; catalog จะ route ไป H100/NT ให้ถูก
    const thinkingMode = resolveChatThinkingMode(message, {
      forceFast: req.body?.mode === "fast" || req.body?.thinkingMode === "fast",
      forceThink: req.body?.thinkingMode === "think",
    });
    const gatewayResponse = await callOpenAiGateway(
      messages,
      conversation.bot?.model || undefined,
      req.body?.mode === "fast" ? "fast" : undefined,
      thinkingMode,
    );
    const tokenUsage = getTokenUsage(gatewayResponse);
    const msg = gatewayResponse?.choices?.[0]?.message;
    const rawReply =
      String(msg?.content || "").trim()
      || String(msg?.reasoning_content || "").trim()
      || "Sorry, I could not generate a response.";

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
    replyToSave = stripLatexToPlainText(replyToSave);
    replyToSave = stripRedundantShortSummary(replyToSave);
    replyToSave = toCompactAuthorityReply(message, replyToSave, {
      respectPrivate: hasPrivateContext,
    });

    const references = shouldOmitReferencesForReply(replyToSave) ? [] : citationReferences;
    replyToSave = stripInvalidCitationMarkers(replyToSave, references.length);
    const modelMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "model",
        content: replyToSave,
        groundingChunks: references.length > 0 ? (groundingChunks ?? undefined) : undefined,
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
  const privateMode = false;
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
    const capabilityReply = getSystemCapabilityReply(rawContextDocs, message);
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
  const botDocsForListLine = (conversation.bot?.documents || []).map((l) => l.document).filter(Boolean);
  const capabilityDocsLine = botDocsForListLine.length > 0
    ? botDocsForListLine
    : (conversation.document ? [conversation.document] : []);
  if (isDocumentListQuery(message) || isSystemCapabilityQuery(message)) {
    const capabilityReply = getSystemCapabilityReply(capabilityDocsLine, message);
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
  if (conversation.bot?.name !== HELP_BOT_NAME && isCasualOffTopicQuery(message)) {
    await prisma.message.create({
      data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
    });
    await prisma.message.create({
      data: { conversationId, role: "model", content: OUT_OF_SCOPE_REPLY, platform: LINE_PLATFORM },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), title: conversation.title ?? message.trim().slice(0, 80) },
    });
    await prisma.usageDaily.update({ where: { id: usage.id }, data: { chatCount: { increment: 1 } } });
    await invalidateConversationCaches(conversation.id, userId);
    return { reply: OUT_OF_SCOPE_REPLY };
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
  // LINE ไม่มีโหมดส่วนตัว — ใช้ตารางอำนาจระบบได้ตามปกติ
  const approvalAuthorityReply = privateMode ? null : await getApprovalAuthorityReply(message);
  const productManagerReply = privateMode ? null : await getProductManagerReply(message);
  let rememberGuidanceReply = null;
  if (!privateMode && !isHelpBot && isRememberOverrideRequest(message)) {
    rememberGuidanceReply = buildRememberOverrideReply(
      message,
      groundingChunks,
      getAuthorityOverrideFromQuestion(message),
    );
  }
  const deterministicReply = ntPricingReply
    || rememberGuidanceReply
    || approvalAuthorityReply
    || (!privateMode && deterministicRulesEnabled ? getDeterministicRuleReply(message) : null)
    || productManagerReply;
  // ส่งข้อเท็จจริงให้โมเดลเรียบเรียง — ไม่ตัดจบด้วยประโยคสำเร็จรูป
  const hasEvidence = hasSufficientGroundingEvidence(message, groundingChunks);
  const casualOffTopic = !isHelpBot && !hasPrivateContext && isCasualOffTopicQuery(message);
  const rejectNoGrounding = !isHelpBot && !overviewRequest
    && !deterministicReply
    && !hasPrivateContext
    && (
      casualOffTopic
      || (!followUpIntent && (groundingChunks.length === 0 || !hasEvidence))
    );
  if (rejectNoGrounding) {
    const fallbackReply = casualOffTopic ? OUT_OF_SCOPE_REPLY : getNoDataReply(message);
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
      "โหมดส่วนตัว: ผู้ใช้ได้ตั้งค่าส่วนตัวไว้ (อาจมี 'คำสั่งจากผู้ใช้', 'ข้อมูล/ความรู้ส่วนตัว' และ 'บทสนทนาก่อนหน้า'). ให้ทำตามคำสั่งของผู้ใช้อย่างเคร่งครัด, ใช้ข้อมูลส่วนตัวและความจำก่อนหน้าตอบได้เต็มที่ร่วมกับ Context จากเอกสารระบบ, ห้ามตอบว่าไม่พบข้อมูลถ้าตอบได้จากส่วนเหล่านี้, และเมื่อข้อมูลส่วนตัวขัดกับเอกสารระบบให้ระบุที่มาทั้งสองฝั่งอย่างชัดเจน. ข้อความจากข้อมูลส่วนตัวให้ห่อด้วย ==...==",
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
    ...(deterministicReply
      ? [{
          role: "system",
          content: buildAuthoritativeFactPrompt(deterministicReply),
        }]
      : []),
    ...(isComparativeAuthorityQuery(message)
      ? [{
          role: "system",
          content: "คำถามนี้เป็นการเปรียบเทียบหลายกรณี ให้ตอบแยกทีละกรณีตามเงื่อนไขตัวเลขในคำถาม และถ้าข้อมูลไม่ครบให้ระบุว่ากรณีใดไม่พบหลักฐาน",
        }]
      : []),
    ...historyMessages,
    ...buildPrivateSystemMessages({ instructions: privateInstructions, knowledge: privateKnowledge, memory: privateMemory }),
    { role: "user", content: message },
  ];

  await prisma.message.create({
    data: { conversationId, userId, role: "user", content: message, platform: LINE_PLATFORM },
  });
  const thinkingMode = resolveChatThinkingMode(message);
  const gatewayResponse = await callOpenAiGateway(
    messages,
    conversation.bot?.model || undefined,
    undefined,
    thinkingMode,
  );
  const tokenUsage = getTokenUsage(gatewayResponse);
  const msg = gatewayResponse?.choices?.[0]?.message;
  const rawReply =
    String(msg?.content || "").trim()
    || String(msg?.reasoning_content || "").trim()
    || "Sorry, I could not generate a response.";
  let replyToSave = rawReply;
  const suggestionsMatch = rawReply.match(/\n\s*SUGGESTIONS\s*:\s*\n([\s\S]*)/i);
  if (suggestionsMatch) replyToSave = rawReply.slice(0, suggestionsMatch.index).trim();

  replyToSave = stripDocumentLeadIn(replyToSave);
  replyToSave = stripLatexToPlainText(replyToSave);
  replyToSave = stripRedundantShortSummary(replyToSave);
  replyToSave = toCompactAuthorityReply(message, replyToSave, {
    respectPrivate: hasPrivateContext,
  });

  const candidateRefs = flattenReferencesForCitations(
    buildReferencesForReply({
      groundingChunks,
      contextDocuments,
      primaryDocument: conversation.document,
      message,
      hasPrivateContext,
    }),
  );
  const references = shouldOmitReferencesForReply(replyToSave) ? [] : candidateRefs;
  replyToSave = stripInvalidCitationMarkers(replyToSave, references.length);
  await prisma.message.create({
    data: {
      conversationId,
      role: "model",
      content: replyToSave,
      groundingChunks: references.length > 0 ? (groundingChunks ?? undefined) : undefined,
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
