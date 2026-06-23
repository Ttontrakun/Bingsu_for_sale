import { prisma } from "../db.js";
import { chatRetentionDays, chatRetentionIntervalMs } from "../config.js";
import { logEvent } from "../lib/logging.js";

let retentionTimer = null;

const pruneOldChatData = async () => {
  if (!Number.isFinite(chatRetentionDays) || chatRetentionDays <= 0) return;
  const cutoff = new Date(Date.now() - chatRetentionDays * 24 * 60 * 60 * 1000);
  const deletedMessages = await prisma.message.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  const deletedConversations = await prisma.conversation.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      messages: { none: {} },
    },
  });

  if (deletedMessages.count > 0 || deletedConversations.count > 0) {
    await logEvent({
      event: "chat.retention.pruned",
      targetType: "chat_data",
      meta: {
        deletedMessages: deletedMessages.count,
        deletedConversations: deletedConversations.count,
        retentionDays: chatRetentionDays,
        cutoff: cutoff.toISOString(),
      },
      category: "application",
    });
  }
};

export const startChatRetentionJob = () => {
  if (retentionTimer) return;
  if (!Number.isFinite(chatRetentionDays) || chatRetentionDays <= 0) {
    console.log("[chat-retention] disabled (CHAT_RETENTION_DAYS <= 0)");
    return;
  }
  const run = async () => {
    try {
      await pruneOldChatData();
    } catch (err) {
      console.error("[chat-retention] prune failed:", err?.message || err);
    }
  };
  run().catch(() => null);
  retentionTimer = setInterval(run, chatRetentionIntervalMs);
  if (typeof retentionTimer?.unref === "function") retentionTimer.unref();
  console.log(
    `[chat-retention] started: every ${chatRetentionIntervalMs}ms, keep ${chatRetentionDays} day(s)`,
  );
};
