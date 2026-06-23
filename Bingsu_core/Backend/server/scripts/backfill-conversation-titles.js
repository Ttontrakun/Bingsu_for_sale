import dotenv from "dotenv";
import { prisma } from "../db.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const REDACTED_PLACEHOLDER_RE = /^\[REDACTED_[A-Z_]+\]$/i;

const isRedactedPlaceholder = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  return REDACTED_PLACEHOLDER_RE.test(text);
};

const sanitizeTitle = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);

const pickConversationTitle = (messages = []) => {
  // Prefer the first model response that has readable text.
  for (const msg of messages) {
    const role = String(msg?.role || "").toLowerCase();
    const text = sanitizeTitle(msg?.content);
    if (role === "model" && text && !isRedactedPlaceholder(text)) return text;
  }
  // Fallback: any non-redacted message content.
  for (const msg of messages) {
    const text = sanitizeTitle(msg?.content);
    if (text && !isRedactedPlaceholder(text)) return text;
  }
  return "New Chat";
};

const main = async () => {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { title: "[REDACTED_USER_MESSAGE]" },
        { title: "[REDACTED_CONVERSATION_TITLE]" },
      ],
    },
    select: {
      id: true,
      title: true,
      messages: {
        select: { role: true, content: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 200,
      },
    },
  });

  if (!conversations.length) {
    console.log("No conversation titles to backfill.");
    return;
  }

  let updated = 0;
  for (const conversation of conversations) {
    const nextTitle = pickConversationTitle(conversation.messages);
    if (!nextTitle || isRedactedPlaceholder(nextTitle)) continue;
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { title: nextTitle },
    });
    updated += 1;
  }

  console.log(`Backfill complete: ${updated}/${conversations.length} conversation title(s) updated.`);
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
