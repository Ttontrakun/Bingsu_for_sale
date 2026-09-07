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
    // ถามถึงเอกสาร → แนบการ์ดทุกชุดความรู้ ให้กดเปิดไฟล์ต้นฉบับได้ทันที
    const capabilityRefs = isDocumentListQuery(message)
      ? buildDocumentListReferences(capabilityDocsNonStream)
      : [];
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
        references: capabilityRefs.length > 0 ? capabilityRefs : undefined,
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
      references: capabilityRefs,
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
