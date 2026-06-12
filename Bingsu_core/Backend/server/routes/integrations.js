import express from "express";
import { prisma } from "../db.js";
import { authenticate } from "../lib/auth.js";
import { publicBaseUrl } from "../config.js";
import { logEvent } from "../lib/logging.js";

export const integrationsRouter = express.Router();

const PROVIDERS = ["line", "messenger", "website", "api"];

const normalizeProvider = (value) => String(value || "").trim().toLowerCase();

/** สำหรับ LINE: ไม่ส่ง secret/token ออกไป แค่บอกว่ามีการตั้งค่าแล้ว + สร้าง webhook URL */
const maskLineConfig = (config) => {
  if (!config || typeof config !== "object") return null;
  return {
    botId: config.botId ?? null,
    hasChannelSecret: Boolean(config.channelSecret),
    hasChannelAccessToken: Boolean(config.channelAccessToken),
  };
};

integrationsRouter.get("/integrations", authenticate, async (req, res) => {
  const rows = await prisma.integrationSetting.findMany({
    where: { userId: req.user.id },
    orderBy: { provider: "asc" },
  });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  res.json(
    PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      const base = {
        provider,
        enabled: Boolean(row?.enabled),
        config: provider === "line" ? maskLineConfig(row?.config) : (row?.config ?? null),
        updatedAt: row?.updatedAt?.toISOString?.() ?? null,
      };
      if (provider === "line" && publicBaseUrl) {
        base.webhookUrl = `${publicBaseUrl}/api/webhooks/line`;
      }
      return base;
    }),
  );
});

integrationsRouter.patch("/integrations/:provider", authenticate, async (req, res) => {
  const provider = normalizeProvider(req.params.provider);
  if (!PROVIDERS.includes(provider)) {
    res.status(400).json({ error: "Unsupported provider" });
    return;
  }

  const { enabled, config } = req.body ?? {};
  if (enabled === undefined && config === undefined) {
    res.status(400).json({ error: "enabled or config is required" });
    return;
  }

  const safeEnabled = enabled === undefined ? undefined : Boolean(enabled);
  let safeConfig = config === undefined ? undefined : config;

  // Normalize LINE config to avoid stale/mismatched botId types
  if (provider === "line" && safeConfig && typeof safeConfig === "object") {
    const cfg = { ...(safeConfig || {}) };
    if (cfg.botId !== undefined && cfg.botId !== null) {
      const b = String(cfg.botId).trim();
      cfg.botId = b || null;
    }
    safeConfig = cfg;
  }

  try {
    const updated = await prisma.integrationSetting.upsert({
      where: {
        userId_provider: {
          userId: req.user.id,
          // Prisma enum mapping: IntegrationProvider values are the same strings
          provider,
        },
      },
      update: {
        enabled: safeEnabled,
        config: safeConfig,
      },
      create: {
        userId: req.user.id,
        provider,
        enabled: safeEnabled ?? false,
        config: safeConfig ?? undefined,
      },
    });

    // log สำหรับติดตาม “ผูก bot กับ line / เปิด-ปิด integration”
    if (provider === "line") {
      const cfg = updated?.config && typeof updated.config === "object" ? updated.config : {};
      await logEvent({
        event: "integration.line.updated",
        actorId: req.user.id,
        targetType: "integration",
        targetId: "line",
        meta: {
          enabled: Boolean(updated.enabled),
          botId: cfg.botId ?? null,
          hasChannelSecret: Boolean(cfg.channelSecret),
          hasChannelAccessToken: Boolean(cfg.channelAccessToken),
        },
      });
    } else {
      await logEvent({
        event: "integration.updated",
        actorId: req.user.id,
        targetType: "integration",
        targetId: provider,
        meta: { enabled: Boolean(updated.enabled) },
      });
    }

    res.json({
      provider: updated.provider,
      enabled: updated.enabled,
      config: updated.config ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    await logEvent({
      event: "integration.update.failed",
      actorId: req.user.id,
      targetType: "integration",
      targetId: provider,
      meta: { error: e?.message || String(e) },
    }).catch(() => null);
    res.status(500).json({ error: "Failed to update integration" });
  }

});

