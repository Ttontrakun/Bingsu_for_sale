import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env.local" });
dotenv.config();

const REDACTED_RE = /^\[REDACTED_[A-Z_]+\]$/i;
const isRedacted = (value) => REDACTED_RE.test(String(value || "").trim());

const withDatabaseName = (databaseUrl, dbName) => {
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
};

const main = async () => {
  const sourceDbName = process.env.RESTORE_SOURCE_DB || "ask_the_manual_restore_tmp";
  const baseDatabaseUrl = process.env.DATABASE_URL;
  if (!baseDatabaseUrl) {
    throw new Error("Missing DATABASE_URL");
  }

  const sourceDatabaseUrl = withDatabaseName(baseDatabaseUrl, sourceDbName);
  const mainPrisma = new PrismaClient();
  const sourcePrisma = new PrismaClient({
    datasourceUrl: sourceDatabaseUrl,
  });

  try {
    const sourceMessages = await sourcePrisma.message.findMany({
      select: { id: true, content: true },
    });
    const sourceConversations = await sourcePrisma.conversation.findMany({
      select: { id: true, title: true },
    });

    const sourceMessageMap = new Map(
      sourceMessages
        .filter((row) => row?.id && row?.content && !isRedacted(row.content))
        .map((row) => [row.id, row.content]),
    );
    const sourceConversationMap = new Map(
      sourceConversations
        .filter((row) => row?.id && row?.title && !isRedacted(row.title))
        .map((row) => [row.id, row.title]),
    );

    const targetMessages = await mainPrisma.message.findMany({
      where: { content: { startsWith: "[REDACTED_" } },
      select: { id: true, content: true },
    });
    const targetConversations = await mainPrisma.conversation.findMany({
      where: { title: { startsWith: "[REDACTED_" } },
      select: { id: true, title: true },
    });

    let messageUpdated = 0;
    let messageNoMatch = 0;
    for (const row of targetMessages) {
      const restored = sourceMessageMap.get(row.id);
      if (!restored) {
        messageNoMatch += 1;
        continue;
      }
      await mainPrisma.message.update({
        where: { id: row.id },
        data: { content: restored },
      });
      messageUpdated += 1;
    }

    let conversationUpdated = 0;
    let conversationNoMatch = 0;
    for (const row of targetConversations) {
      const restored = sourceConversationMap.get(row.id);
      if (!restored) {
        conversationNoMatch += 1;
        continue;
      }
      await mainPrisma.conversation.update({
        where: { id: row.id },
        data: { title: restored },
      });
      conversationUpdated += 1;
    }

    console.log(
      JSON.stringify(
        {
          sourceDbName,
          sourceMessages: sourceMessages.length,
          sourceConversations: sourceConversations.length,
          targetRedactedMessages: targetMessages.length,
          targetRedactedConversations: targetConversations.length,
          messageUpdated,
          messageNoMatch,
          conversationUpdated,
          conversationNoMatch,
        },
        null,
        2,
      ),
    );
  } finally {
    await sourcePrisma.$disconnect();
    await mainPrisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
