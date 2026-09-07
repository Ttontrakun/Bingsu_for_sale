import {
  prisma,
  authenticate,
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
  resolveGroundingChunks,
  MAX_PRIVATE_CONTEXT_CHARS,
  MAX_PRIVATE_INSTRUCTIONS_CHARS,
  MAX_PRIVATE_MEMORY_CHARS,
  loadUserPrivateContent,
  loadPrivateContextParts,
  loadCrossChatMemory,
  buildPrivateSystemMessages,
  appendPrivateKnowledge,
  HELP_BOT_NAME,
  REDACTED_PLACEHOLDERS,
  isRedactedPlaceholder,
  resolveConversationTitle,
  sanitizeRedactedContentForClient,
  buildSectionedContext,
  PLATFORM_VALUES,
  getPlatform,
  coerceInt,
  getTokenUsage,
  getUsedTokensFromRow,
  MAX_CONTEXT_CHARS_FOR_MODEL,
  applyCorrectionToKnowledge,
  applyCorrectionToVectorDb,
  escapeRegExp,
  normalizeForMatch,
  buildLooseWhitespaceRegex,
  replaceTextFlexible,
  applyCorrectionToDocumentSourceFiles,
  DOCUMENT_SCOPE_FOLLOWUPS,
  LINE_PLATFORM,
} from "./shared.js";
import { conversationsRouter, messagesRouter, chatRouter, privateContextRouter } from "./routers.js";

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
  const { conversationId, content, groundingChunks } = req.body ?? {};
  const role = "user";

  if (!conversationId || !content) {
    res.status(400).json({ error: "conversationId and content are required" });
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
