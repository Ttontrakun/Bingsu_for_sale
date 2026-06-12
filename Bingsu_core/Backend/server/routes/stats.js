import express from "express";
import { prisma } from "../db.js";
import { authenticate } from "../lib/auth.js";

export const statsRouter = express.Router();

const parseDateParam = (value) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const formatDay = (date) => date.toISOString().slice(0, 10);

const DEFAULT_DAYS = 30;
const PLATFORMS = ["line", "messenger", "website", "api", "sandbox"];

statsRouter.get("/stats", authenticate, async (req, res) => {
  const now = new Date();
  const toRaw = parseDateParam(req.query.to) ?? now;
  const fromRaw =
    parseDateParam(req.query.from) ?? addDays(toRaw, -DEFAULT_DAYS);

  const from = startOfDay(fromRaw);
  const to = startOfDay(toRaw);
  const toExclusive = addDays(to, 1);

  // total incoming messages (user role)
  const totalMessages = await prisma.message.count({
    where: {
      conversation: { userId: req.user.id },
      role: "user",
      createdAt: { gte: from, lt: toExclusive },
    },
  });

  // platform breakdown (user messages)
  const platformRows = await prisma.message.groupBy({
    by: ["platform"],
    where: {
      conversation: { userId: req.user.id },
      role: "user",
      createdAt: { gte: from, lt: toExclusive },
    },
    _count: { _all: true },
  });
  const platformCounts = Object.fromEntries(
    PLATFORMS.map((p) => [p, 0]),
  );
  platformRows.forEach((row) => {
    const key = String(row.platform || "website").toLowerCase();
    if (key in platformCounts) platformCounts[key] = row._count._all;
    else platformCounts.website += row._count._all;
  });

  // timeseries (user messages), grouped by day+platform using SQL for speed
  const seriesRows = await prisma.$queryRaw`
    SELECT
      date_trunc('day', "createdAt")::date AS "day",
      COALESCE(NULLIF(lower("platform"), ''), 'website') AS "platform",
      COUNT(*)::int AS "count"
    FROM "Message"
    INNER JOIN "Conversation" ON "Conversation"."id" = "Message"."conversationId"
    WHERE
      "Conversation"."userId" = ${req.user.id}
      AND "Message"."role" = 'user'
      AND "Message"."createdAt" >= ${from}
      AND "Message"."createdAt" < ${toExclusive}
    GROUP BY 1, 2
    ORDER BY 1 ASC;
  `;

  const series = (Array.isArray(seriesRows) ? seriesRows : []).map((row) => ({
    day: typeof row.day === "string" ? row.day : formatDay(new Date(row.day)),
    platform: String(row.platform || "website").toLowerCase(),
    count: Number(row.count || 0),
  }));

  // bot type: we only have LLM in this app right now
  const llmResponses = await prisma.message.count({
    where: {
      conversation: { userId: req.user.id },
      role: "model",
      createdAt: { gte: from, lt: toExclusive },
    },
  });

  res.json({
    range: { from: formatDay(from), to: formatDay(to) },
    totalMessages,
    platformCounts,
    series,
    botTypeCounts: {
      faq: 0,
      llm: llmResponses,
      admin: 0,
    },
  });
});

