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
    // ถามถึงเอกสาร → แนบการ์ดทุกชุดความรู้ ให้กดเปิดไฟล์ต้นฉบับได้ทันที
    const capabilityRefs = isDocumentListQuery(message)
      ? buildDocumentListReferences(capabilityDocs)
      : [];
    await prisma.message.create({
      data: { conversationId, userId: req.user.id, role: "user", content: message, platform: getPlatform(req) },
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
        references: capabilityRefs,
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

