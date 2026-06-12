import { prisma } from "../db.js";

/**
 * Log an event to SystemLog (and console in dev).
 * @param {{ event: string, actorId?: string, targetType?: string, targetId?: string, meta?: object }} opts
 */
export async function logEvent(opts) {
  const { event, actorId, targetType, targetId, meta = {} } = opts;
  const message = event;
  const level = "info";
  const metaJson = { actorId, targetType, targetId, ...meta };
  delete metaJson.ip;
  try {
    await prisma.systemLog.create({
      data: {
        level,
        message,
        meta: metaJson,
        userId: actorId ?? null,
      },
    });
  } catch (err) {
    console.error("logEvent failed:", err);
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`[log] ${event}`, metaJson);
  }
}
