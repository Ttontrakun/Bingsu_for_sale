import { prisma } from "../db.js";

export const getDateKey = () => new Date().toISOString().slice(0, 10);

export const getOrCreateUsageDaily = async (userId) => {
  const dateKey = getDateKey();
  // Use upsert to avoid race condition when multiple requests
  // create the same (userId, dateKey) row concurrently.
  return prisma.usageDaily.upsert({
    where: { userId_dateKey: { userId, dateKey } },
    update: {},
    create: { userId, dateKey },
  });
};
