import crypto from "crypto";
import { prisma } from "../db.js";
import { sessionTtlDaysSafe } from "../config.js";

const hashSessionToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");

export const createSession = async (userId) => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const token = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + sessionTtlDaysSafe * 24 * 60 * 60 * 1000);
  const created = await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
  return { ...created, token: rawToken };
};

export const startSessionCleanup = () => {
  const cleanupIntervalMinutes = Number(process.env.CLEANUP_INTERVAL_MINUTES || 30);
  const cleanupIntervalMs = Number.isFinite(cleanupIntervalMinutes)
    ? cleanupIntervalMinutes * 60 * 1000
    : 30 * 60 * 1000;
  setInterval(async () => {
    try {
      await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }, cleanupIntervalMs);
};
