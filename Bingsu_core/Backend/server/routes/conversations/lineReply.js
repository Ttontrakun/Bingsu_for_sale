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
