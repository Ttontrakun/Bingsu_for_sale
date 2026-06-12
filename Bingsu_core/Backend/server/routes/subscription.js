import express from "express";
import { authenticate } from "../lib/auth.js";
import { FREE_DAILY_TOKEN_LIMIT, FREE_KNOWLEDGE_LIMIT } from "../config.js";
import { getOrCreateUsageDaily } from "../services/usage.js";

export const subscriptionRouter = express.Router();

subscriptionRouter.get("/subscription", authenticate, async (req, res) => {
  const usage = await getOrCreateUsageDaily(req.user.id);
  res.json({
    plan: {
      name: "Free Plan",
      dailyTokenLimit: FREE_DAILY_TOKEN_LIMIT,
      knowledgeLimit: FREE_KNOWLEDGE_LIMIT,
      channels: ["line", "messenger", "website", "api"],
    },
    usage: {
      dateKey: usage.dateKey,
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      chatCount: usage.chatCount ?? 0,
    },
  });
});

