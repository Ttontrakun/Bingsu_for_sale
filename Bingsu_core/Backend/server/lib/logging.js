import { prisma } from "../db.js";

const detectCategory = (event = "") => {
  const e = String(event || "").toLowerCase();
  if (
    e.startsWith("auth.")
    || e.startsWith("support.")
    || e.startsWith("admin.")
    || e.startsWith("user.approval.")
    || e.includes(".failed")
    || e.includes(".rejected")
    || e.includes("http.error")
    || e.includes("http.exception")
  ) {
    return "security";
  }
  return "application";
};

/**
 * Log an event to SystemLog (and console in dev).
 * @param {{ event: string, actorId?: string, targetType?: string, targetId?: string, meta?: object, level?: string, category?: string, outcome?: string }} opts
 */
export async function logEvent(opts) {
  const { event, actorId, targetType, targetId, meta = {}, level, category, outcome } = opts;
  const message = event;
  const levelToStore = String(level || "info").toLowerCase();
  const categoryToStore = String(category || detectCategory(event)).toLowerCase();
  const metaJson = { actorId, targetType, targetId, outcome: outcome || null, category: categoryToStore, ...meta };
  try {
    await prisma.systemLog.create({
      data: {
        level: levelToStore,
        message,
        meta: metaJson,
        userId: actorId ?? null,
      },
    });
  } catch (err) {
    console.error("logEvent failed:", err);
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`[log] ${levelToStore}:${categoryToStore} ${event}`, metaJson);
  }
}
