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
