const REDACTED_PLACEHOLDERS = new Set([
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
