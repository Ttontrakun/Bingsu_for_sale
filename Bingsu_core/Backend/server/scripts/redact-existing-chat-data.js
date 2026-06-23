import dotenv from "dotenv";
import { prisma } from "../db.js";
import { redactSensitiveText } from "../lib/privacy.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const REDACTED_RE = /^\[REDACTED_[A-Z_]+\]$/i;
const PAGE_SIZE = 500;

const shouldSkip = (value) => {
  const text = String(value || "").trim();
  return !text || REDACTED_RE.test(text);
};

const redactExistingUserMessages = async () => {
  let scanned = 0;
  let updated = 0;
  let cursorId = null;

  while (true) {
    const rows = await prisma.message.findMany({
      where: { role: "user" },
      select: { id: true, content: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
    });

    if (!rows.length) break;

    for (const row of rows) {
      scanned += 1;
      if (shouldSkip(row.content)) continue;
      const redacted = redactSensitiveText(row.content);
      if (redacted === row.content) continue;
      await prisma.message.update({
        where: { id: row.id },
        data: { content: redacted },
      });
      updated += 1;
    }

    cursorId = rows[rows.length - 1].id;
  }

  return { scanned, updated };
};

const redactExistingConversationTitles = async () => {
  let scanned = 0;
  let updated = 0;
  let cursorId = null;

  while (true) {
    const rows = await prisma.conversation.findMany({
      select: { id: true, title: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
    });

    if (!rows.length) break;

    for (const row of rows) {
      scanned += 1;
      if (shouldSkip(row.title)) continue;
      const redacted = redactSensitiveText(row.title);
      if (redacted === row.title) continue;
      await prisma.conversation.update({
        where: { id: row.id },
        data: { title: redacted.slice(0, 255) },
      });
      updated += 1;
    }

    cursorId = rows[rows.length - 1].id;
  }

  return { scanned, updated };
};

const main = async () => {
  const messages = await redactExistingUserMessages();
  const conversations = await redactExistingConversationTitles();
  console.log(
    JSON.stringify(
      {
        messages,
        conversations,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error("[redact-existing-chat-data] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
