import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../db.js";
import { authenticate } from "../lib/auth.js";
import { logEvent } from "../lib/logging.js";
import { invalidateUserCaches } from "../lib/cache.js";
import { parseSafeAvatarDataUrl, sanitizeAvatarUrlString } from "../lib/avatarSafe.js";
import { deleteBotWithCleanup } from "../services/uploadQueue.js";
import { isFeatureEnabled } from "../lib/systemConfig.js";
import {
  getChatModelOptions,
  getChatModelLabel,
  getChatModelLogDetail,
  getChatModelGatewayKey,
  isAllowedChatModel,
} from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

export const botsRouter = express.Router();
const HELP_BOT_NAME = "บอทช่วยสอน";
const DEFAULT_BOT_NAME = "Enterprise AI Chatbot Assistant";
const normalizeName = (value) => String(value || "").trim();

/** รายการที่เปลี่ยนในฟอร์มแก้ไขบอท — ใช้ใน log ให้แอดมินอ่านง่าย */
function botPatchChangeLabels(body, documentIdsTouched, { modelBefore, modelAfter } = {}) {
  const { name, prompt, description, model, avatarUrl, enabled } = body ?? {};
  const labels = [];
  if (name !== undefined) labels.push("ชื่อบอท");
  if (prompt !== undefined) labels.push("Prompt / คำสั่งระบบ");
  if (description !== undefined) labels.push("คำอธิบาย");
  if (model !== undefined) {
    const from = getChatModelLogDetail(modelBefore);
    const to = getChatModelLogDetail(modelAfter);
    labels.push(
      from === to
        ? `โมเดลแชท: ${to}`
        : `เปลี่ยนโมเดลแชท จาก「${from}」เป็น「${to}」`,
    );
  }
  if (avatarUrl !== undefined) labels.push("รูปโปรไฟล์");
  if (enabled !== undefined) labels.push("เปิด/ปิดการใช้งาน");
  if (documentIdsTouched) labels.push("ชุดความรู้ (Knowledge)");
  return labels;
}

const isStaff = (user) => user?.role === "admin" || user?.role === "support";

const formatBot = (bot, { includePrompt = false, viewerId = null } = {}) => ({
  id: bot.id,
  name: bot.name,
  ...(includePrompt ? { prompt: bot.prompt } : {}),
  description: bot.description,
  model: bot.model,
  avatarUrl: bot.avatarUrl,
  enabled: bot.enabled !== false,
  ownerId: bot.ownerId ?? null,
  isOwned: Boolean(viewerId && bot.ownerId === viewerId),
  createdAt: bot.createdAt,
  updatedAt: bot.updatedAt,
  documents: (bot.documents || []).map((link) => link.document),
});

botsRouter.get("/model-options", authenticate, async (_req, res) => {
  res.json({ items: getChatModelOptions() });
});

botsRouter.get("/", authenticate, async (req, res) => {
  const bots = await prisma.bot.findMany({
    where: {
      OR: [
        { ownerId: req.user.id },
        { name: DEFAULT_BOT_NAME },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      documents: {
        include: {
          document: { select: { id: true, displayName: true } },
        },
      },
    },
  });
  // ไม่โชว์บอทช่วยสอนในหน้ารายการ Bot (ใช้เบื้องหลังสำหรับ 3 ปุ่มบน homepage)
  const filtered = bots.filter((b) => b.name !== HELP_BOT_NAME);
  res.json(
    filtered.map((bot) =>
      formatBot(bot, {
        includePrompt: isStaff(req.user) || bot.ownerId === req.user.id,
        viewerId: req.user.id,
      }),
    ),
  );
});

botsRouter.post("/", authenticate, async (req, res) => {
  const { name, prompt, description, model, avatarUrl, documentIds } = req.body ?? {};

  // ผู้ใช้ทั่วไปสร้างบอทได้เมื่อ Admin Dev เปิดเมนู/feature นี้เท่านั้น
  if (req.user?.role === "user") {
    const allowed = await isFeatureEnabled("user.createBot");
    if (!allowed) {
      res.status(403).json({ error: "ฟีเจอร์สร้างบอทยังไม่ได้เปิดใช้งาน" });
      return;
    }
  }

  if (!name || !prompt) {
    res.status(400).json({ error: "name and prompt are required" });
    return;
  }
  const normalizedModel =
    model == null || String(model).trim() === "" ? null : String(model).trim();
  if (normalizedModel && !isAllowedChatModel(normalizedModel)) {
    res.status(400).json({ error: "โมเดลที่เลือกไม่รองรับ" });
    return;
  }
  const normalizedName = normalizeName(name);
  if (!normalizedName) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const duplicate = await prisma.bot.findFirst({
    where: {
      ownerId: req.user.id,
      name: { equals: normalizedName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    res.status(409).json({ error: "ชื่อบอทนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น" });
    return;
  }

  // ผู้ใช้ทั่วไปมีได้เพียง 1 บอทหลัก (ไม่นับบอทช่วยสอนระบบ)
  if (req.user?.role === "user") {
    const existingUserBot = await prisma.bot.findFirst({
      where: {
        ownerId: req.user.id,
        name: { not: HELP_BOT_NAME },
      },
      select: { id: true },
    });
    if (existingUserBot) {
      res.status(409).json({ error: "บัญชีผู้ใช้สามารถมีบอทได้เพียง 1 ตัว" });
      return;
    }
  }

  const rawIds = Array.isArray(documentIds) ? documentIds : [];
  const uniqueIds = [...new Set(rawIds.filter(Boolean))];
  let validIds = uniqueIds;
  if (uniqueIds.length > 0) {
    const accessibleDocs = await prisma.document.findMany({
      where: {
        id: { in: uniqueIds },
        OR: [
          { ownerId: req.user.id },
          { shares: { some: { userId: req.user.id } } },
        ],
      },
      select: { id: true },
    });
    const accessibleIdSet = new Set(accessibleDocs.map((doc) => doc.id));
    validIds = uniqueIds.filter((id) => accessibleIdSet.has(id));
  }

  const bot = await prisma.bot.create({
    data: {
      name: normalizedName,
      prompt,
      description: description ?? null,
      model: normalizedModel,
      avatarUrl: avatarUrl ?? null,
      ownerId: req.user.id,
      enabled: true,
      documents: validIds.length
        ? {
            create: validIds.map((id) => ({ documentId: id })),
          }
        : undefined,
    },
    include: {
      documents: {
        include: { document: { select: { id: true, displayName: true } } },
      },
    },
  });

  const isUserActor = req.user?.role === "user";
  await logEvent({
    event: isUserActor ? "user.bot.created" : "bot.created",
    actorId: req.user.id,
    targetType: "bot",
    targetId: bot.id,
    meta: {
      botName: bot.name,
      knowledgeCount: validIds.length,
      actorRole: req.user?.role || null,
      actorEmail: req.user?.email || null,
      actorName: req.user?.name || null,
      createdAt: bot.createdAt?.toISOString?.() || new Date().toISOString(),
      model: bot.model || null,
      modelLabel: getChatModelLabel(bot.model),
      modelDetail: getChatModelLogDetail(bot.model),
      modelGateway: getChatModelGatewayKey(bot.model),
    },
  });

  res.status(201).json({
    id: bot.id,
    name: bot.name,
    prompt: bot.prompt,
    description: bot.description,
    model: bot.model,
    avatarUrl: bot.avatarUrl,
    enabled: true,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
    documents: bot.documents.map((link) => link.document),
  });
  await invalidateUserCaches(req.user.id);
});

const HELP_DOC_DISPLAY_NAME = "คู่มือการใช้งาน";

// ต้องล็อกอิน — ไม่ส่ง system prompt (กันรั่วคำสั่งบอท)
botsRouter.get("/help-config", authenticate, async (_req, res) => {
  const helpDoc = await prisma.document.findFirst({
    where: { displayName: HELP_DOC_DISPLAY_NAME },
    select: { id: true },
  });
  if (!helpDoc) {
    return res.json({ botId: null, documentId: null, bot: null });
  }
  const candidates = await prisma.bot.findMany({
    where: {
      enabled: { not: false },
      documents: {
        some: { documentId: helpDoc.id },
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      model: true,
      avatarUrl: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const helpBot = candidates.find((b) => b.name === HELP_BOT_NAME) || candidates[0] || null;
  if (!helpBot) {
    return res.json({ botId: null, documentId: null, bot: null });
  }
  res.json({
    botId: helpBot.id,
    documentId: helpDoc.id,
    bot: {
      id: helpBot.id,
      name: helpBot.name,
      description: helpBot.description,
      model: helpBot.model,
      avatarUrl: helpBot.avatarUrl,
      enabled: helpBot.enabled !== false,
      createdAt: helpBot.createdAt,
      updatedAt: helpBot.updatedAt,
    },
  });
});

botsRouter.get("/:id", authenticate, async (req, res) => {
  const bot = await prisma.bot.findFirst({
    where: {
      id: req.params.id,
      OR: [{ ownerId: req.user.id }, { name: HELP_BOT_NAME }, { name: DEFAULT_BOT_NAME }],
    },
    include: {
      documents: {
        include: { document: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json(
    formatBot(bot, {
      includePrompt: isStaff(req.user) || bot.ownerId === req.user.id,
      viewerId: req.user.id,
    }),
  );
});

botsRouter.patch("/:id", authenticate, async (req, res) => {
  try {
    const { name, prompt, description, model, avatarUrl: avatarUrlInput, avatarBase64, documentIds, enabled } = req.body ?? {};

    const hasAny =
      name !== undefined || prompt !== undefined || documentIds !== undefined ||
      description !== undefined || model !== undefined || avatarUrlInput !== undefined || avatarBase64 !== undefined || enabled !== undefined;
    if (!hasAny) {
      res.status(400).json({ error: "at least one of name, prompt, description, model, avatarUrl, documentIds, enabled is required" });
      return;
    }

    const bot = await prisma.bot.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
    });

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    if (bot.name === HELP_BOT_NAME) {
      res.status(403).json({ error: "ไม่สามารถแก้ไขบอทช่วยสอนได้" });
      return;
    }

    const rawIds = Array.isArray(documentIds) ? documentIds : null;
    const ids = rawIds ? [...new Set(rawIds.filter(Boolean))] : null;
    let validIds = ids;
    if (ids && ids.length > 0) {
      const accessibleDocs = await prisma.document.findMany({
        where: {
          id: { in: ids },
          OR: [
            { ownerId: req.user.id },
            { shares: { some: { userId: req.user.id } } },
          ],
        },
        select: { id: true },
      });
      const accessibleIdSet = new Set(accessibleDocs.map((doc) => doc.id));
      validIds = ids.filter((id) => accessibleIdSet.has(id));
    }

    const updateData = {};
    if (name !== undefined) {
      const normalizedName = normalizeName(name);
      if (!normalizedName) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const duplicate = await prisma.bot.findFirst({
        where: {
          ownerId: bot.ownerId,
          id: { not: bot.id },
          name: { equals: normalizedName, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate) {
        res.status(409).json({ error: "ชื่อบอทนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น" });
        return;
      }
      updateData.name = normalizedName;
    }
    if (prompt !== undefined) updateData.prompt = prompt;
    if (description !== undefined) updateData.description = description;
    if (model !== undefined) {
      const normalizedModel =
        model == null || String(model).trim() === "" ? null : String(model).trim();
      if (normalizedModel && !isAllowedChatModel(normalizedModel)) {
        res.status(400).json({ error: "โมเดลที่เลือกไม่รองรับ" });
        return;
      }
      updateData.model = normalizedModel;
    }
    let avatarUrl = avatarUrlInput;
    if (typeof avatarBase64 === "string" && avatarBase64.startsWith("data:image/")) {
      const parsed = parseSafeAvatarDataUrl(avatarBase64);
      if (!parsed) {
        res.status(400).json({ error: "รูปโปรไฟล์ไม่รองรับ (อนุญาต png/jpg/webp/gif ขนาดไม่เกิน 2MB)" });
        return;
      }
      const dir = path.join(projectRoot, "uploads", "bot-avatars");
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `${bot.id}.${parsed.ext}`;
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, parsed.buffer);
      avatarUrl = `/uploads/bot-avatars/${fileName}`;
    }
    if (avatarUrl !== undefined) {
      if (typeof avatarUrl !== "string") {
        updateData.avatarUrl = avatarUrl;
      } else {
        const safe = sanitizeAvatarUrlString(avatarUrl);
        if (safe === undefined) {
          res.status(400).json({ error: "avatarUrl ไม่ถูกต้อง" });
          return;
        }
        updateData.avatarUrl = safe;
      }
    }
    if (enabled !== undefined) updateData.enabled = Boolean(enabled);

    const before = {
      name: bot.name,
      avatarUrl: bot.avatarUrl ?? null,
      model: bot.model ?? null,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const updatedBot = Object.keys(updateData).length > 0
        ? await tx.bot.update({
            where: { id: bot.id },
            data: updateData,
          })
        : bot;

      if (ids) {
        await tx.botDocument.deleteMany({ where: { botId: bot.id } });
        if (validIds && validIds.length > 0) {
          await tx.botDocument.createMany({
            data: validIds.map((id) => ({ botId: bot.id, documentId: id })),
          });
        }
      }

      return updatedBot;
    });

    const withDocs = await prisma.bot.findUnique({
      where: { id: updated.id },
      include: { documents: { include: { document: { select: { id: true, displayName: true } } } } },
    });

    await logEvent({
      event: "bot.updated",
      actorId: req.user.id,
      targetType: "bot",
      targetId: withDocs.id,
      meta: {
        botName: withDocs.name,
        changeLabels: botPatchChangeLabels(req.body ?? {}, rawIds !== null, {
          modelBefore: before.model,
          modelAfter: withDocs.model,
        }),
        knowledgeCount: withDocs.documents.length,
        avatar: avatarUrl !== undefined
          ? { from: before.avatarUrl, to: withDocs.avatarUrl ?? null }
          : undefined,
        ...(model !== undefined
          ? {
              modelBefore: before.model,
              modelAfter: withDocs.model || null,
              modelBeforeLabel: getChatModelLabel(before.model),
              modelAfterLabel: getChatModelLabel(withDocs.model),
              modelBeforeDetail: getChatModelLogDetail(before.model),
              modelAfterDetail: getChatModelLogDetail(withDocs.model),
              modelBeforeGateway: getChatModelGatewayKey(before.model),
              modelAfterGateway: getChatModelGatewayKey(withDocs.model),
            }
          : {}),
      },
    });

    res.json({
      id: withDocs.id,
      name: withDocs.name,
      prompt: withDocs.prompt,
      description: withDocs.description,
      model: withDocs.model,
      avatarUrl: withDocs.avatarUrl,
      enabled: withDocs.enabled !== false,
      createdAt: withDocs.createdAt,
      updatedAt: withDocs.updatedAt,
      documents: withDocs.documents.map((link) => link.document),
    });
    await invalidateUserCaches(req.user.id);
  } catch (err) {
    console.error("PATCH /api/bots/:id error:", err);
    res.status(500).json({ error: "เซิร์ฟเวอร์ตอบ 500 — backend อาจยังไม่พร้อม ลองรีเฟรชหรือตรวจสอบ Docker (api/legacy)" });
  }
});

botsRouter.delete("/:id", authenticate, async (req, res) => {
  try {
    const bot = await prisma.bot.findFirst({
      where: { id: req.params.id, ownerId: req.user.id },
    });

    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    if (bot.name === HELP_BOT_NAME) {
      res.status(403).json({ error: "ไม่สามารถลบบอทช่วยสอนได้" });
      return;
    }

    await logEvent({
      event: "bot.deleted",
      actorId: req.user.id,
      targetType: "bot",
      targetId: bot.id,
      meta: { botName: bot.name },
    });

    await deleteBotWithCleanup(bot.id);
    res.json({ ok: true });
    await invalidateUserCaches(req.user.id);
  } catch (error) {
    console.error("Failed to delete bot", error);
    res.status(500).json({ error: "Failed to delete bot" });
  }
});
