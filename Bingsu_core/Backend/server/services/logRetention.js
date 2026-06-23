import { prisma } from "../db.js";
import { systemLogRetentionDays, systemLogRetentionIntervalMs } from "../config.js";
import { logEvent } from "../lib/logging.js";

let retentionTimer = null;

const pruneOldSystemLogs = async () => {
  const cutoff = new Date(Date.now() - systemLogRetentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.systemLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });
  if (result.count > 0) {
    await logEvent({
      event: "system.log.retention.pruned",
      targetType: "system_log",
      meta: {
        deletedCount: result.count,
        retentionDays: systemLogRetentionDays,
        cutoff: cutoff.toISOString(),
      },
      category: "application",
    });
  }
};

export const startSystemLogRetentionJob = () => {
  if (retentionTimer) return;
  const run = async () => {
    try {
      await pruneOldSystemLogs();
    } catch (err) {
      console.error("[log-retention] prune failed:", err?.message || err);
    }
  };
  run().catch(() => null);
  retentionTimer = setInterval(run, systemLogRetentionIntervalMs);
  if (typeof retentionTimer?.unref === "function") retentionTimer.unref();
  console.log(
    `[log-retention] started: every ${systemLogRetentionIntervalMs}ms, keep ${systemLogRetentionDays} day(s)`,
  );
};
