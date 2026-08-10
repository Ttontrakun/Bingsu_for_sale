import express from "express";
import { prisma } from "../db.js";
import { authenticate, requireAdmin, requireRole } from "../lib/auth.js";
import { getRequestContext } from "../lib/requestContext.js";
import { logEvent } from "../lib/logging.js";
import { deleteBotWithCleanup } from "../services/uploadQueue.js";
import { deleteDocumentVectors } from "../services/vectorDb.js";
import { invalidateUserCaches } from "../lib/cache.js";
import { ensureSourceFileBlocks } from "../services/text.js";
import { indexDocumentChunks } from "../services/vectorDb.js";
import { adminMetricsRouter } from "./adminMetrics.js";
import { adminUsersRouter } from "./adminUsers.js";
import { adminUploadsRouter } from "./adminUploads.js";
import { adminAnnouncementsRouter } from "./announcements.js";
import { adminManualRouter } from "./adminManual.js";

export const adminRouter = express.Router();

const HELP_DOC_DISPLAY_NAME = "คู่มือการใช้งาน";


const adminBotPatchChangeLabels = (body) => {
  const { name, prompt, description, enabled, model, avatarUrl, documentIds } = body ?? {};
  const labels = [];
  if (name !== undefined) labels.push("ชื่อบอท");
  if (prompt !== undefined) labels.push("Prompt / คำสั่งระบบ");
  if (description !== undefined) labels.push("คำอธิบาย");
  if (enabled !== undefined) labels.push("เปิด/ปิดการใช้งาน");
  if (model !== undefined) labels.push("โมเดล");
  if (avatarUrl !== undefined) labels.push("รูปโปรไฟล์");
  if (Array.isArray(documentIds)) labels.push("ชุดความรู้ (Knowledge)");
  return labels;
};

// เส้นทาง dashboard/กราฟ + จัดการผู้ใช้ ถูกแยกไป adminMetrics.js / adminUsers.js (path เดิมทั้งหมด)
adminRouter.use(adminMetricsRouter);
adminRouter.use(adminUsersRouter);
adminRouter.use(adminUploadsRouter);
adminRouter.use(adminAnnouncementsRouter);
adminRouter.use(adminManualRouter);


adminRouter.get("/documents", authenticate, requireRole("support", "admin"), async (req, res) => {
  // ownerRole=user → ความรู้ของผู้ใช้ทั่วไป | ค่าเริ่มต้น = ของ Support/Admin
  const ownerRole = String(req.query?.ownerRole || "staff").toLowerCase();
  const ownerFilter =
    ownerRole === "user"
      ? { role: "user" }
      : { role: { in: ["support", "admin"] } };

  const documents = await prisma.document.findMany({
    where: {
      owner: ownerFilter,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  res.json(documents);
});

adminRouter.get("/documents/:id", authenticate, requireRole("support", "admin"), async (req, res) => {
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(document);
});

adminRouter.get("/bots", authenticate, requireRole("support", "admin"), async (req, res) => {
  // ownerRole=user → บอทของผู้ใช้ทั่วไป | ค่าเริ่มต้น = ของ Support/Admin
  const ownerRole = String(req.query?.ownerRole || "staff").toLowerCase();
  const ownerFilter =
    ownerRole === "user"
      ? { role: "user" }
      : { role: { in: ["support", "admin"] } };

  const bots = await prisma.bot.findMany({
    where: {
      owner: ownerFilter,
    },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      documents: { include: { document: { select: { id: true, displayName: true } } } },
    },
  });
  res.json(
    bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      prompt: bot.prompt,
      description: bot.description,
      enabled: bot.enabled,
      model: bot.model,
      avatarUrl: bot.avatarUrl,
      createdAt: bot.createdAt,
      updatedAt: bot.updatedAt,
      owner: bot.owner,
      documents: bot.documents.map((link) => link.document),
    })),
  );
});

adminRouter.post("/bots", authenticate, requireAdmin, async (req, res) => {
  const { name, prompt, description, model, avatarUrl, documentIds } = req.body ?? {};
  const normalizedName = typeof name === "string" ? name.trim().slice(0, 120) : "";
  const normalizedPrompt = typeof prompt === "string" ? prompt : "";
  if (!normalizedName || !normalizedPrompt) {
    res.status(400).json({ error: "name and prompt are required" });
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

  const ids = Array.isArray(documentIds)
    ? Array.from(new Set(documentIds.filter((id) => typeof id === "string" && id.trim())))
    : [];

  const created = await prisma.bot.create({
    data: {
      name: normalizedName,
      prompt: normalizedPrompt,
      description: description === null ? null : typeof description === "string" ? description : null,
      model: model === null ? null : typeof model === "string" ? model : null,
      avatarUrl: avatarUrl === null ? null : typeof avatarUrl === "string" ? avatarUrl : null,
      ownerId: req.user.id,
      enabled: true,
      documents: ids.length
        ? {
            create: ids.map((documentId) => ({ documentId })),
          }
        : undefined,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      documents: { include: { document: { select: { id: true, displayName: true } } } },
    },
  });

  await logEvent({
    event: "admin.bot.created",
    actorId: req.user.id,
    targetType: "bot",
    targetId: created.id,
    meta: { botName: created.name, knowledgeCount: created.documents.length },
  });

  res.status(201).json({
    id: created.id,
    name: created.name,
    prompt: created.prompt,
    description: created.description,
    model: created.model,
    avatarUrl: created.avatarUrl,
    enabled: created.enabled,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    owner: created.owner,
    documents: created.documents.map((link) => link.document),
  });
});

adminRouter.patch("/bots/:id", authenticate, requireAdmin, async (req, res) => {
  const { name, prompt, description, enabled, model, avatarUrl, documentIds } = req.body ?? {};
  if (
    name === undefined &&
    prompt === undefined &&
    description === undefined &&
    enabled === undefined &&
    model === undefined &&
    avatarUrl === undefined &&
    documentIds === undefined
  ) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const bot = await prisma.bot.findUnique({
    where: { id: req.params.id },
    include: { documents: true },
  });
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedBot = await tx.bot.update({
      where: { id: bot.id },
      data: {
        name: typeof name === "string" ? name.trim().slice(0, 120) : undefined,
        prompt: typeof prompt === "string" ? prompt : undefined,
        description: description === null ? null : typeof description === "string" ? description : undefined,
        enabled: typeof enabled === "boolean" ? enabled : undefined,
        model: model === null ? null : typeof model === "string" ? model : undefined,
        avatarUrl: avatarUrl === null ? null : typeof avatarUrl === "string" ? avatarUrl : undefined,
      },
    });

    if (Array.isArray(documentIds)) {
      const ids = Array.from(new Set(documentIds.filter((id) => typeof id === "string" && id.trim())));
      await tx.botDocument.deleteMany({ where: { botId: bot.id } });
      if (ids.length) {
        await tx.botDocument.createMany({
          data: ids.map((documentId) => ({ botId: bot.id, documentId })),
          skipDuplicates: true,
        });
      }
    }

    const full = await tx.bot.findUnique({
      where: { id: bot.id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        documents: { include: { document: { select: { id: true, displayName: true } } } },
      },
    });
    return full;
  });

  await logEvent({
    event: "admin.bot.updated",
    actorId: req.user.id,
    targetType: "bot",
    targetId: bot.id,
    meta: {
      botName: updated.name,
      changeLabels: adminBotPatchChangeLabels(req.body ?? {}),
      knowledgeCount: updated.documents.length,
    },
  });

  res.json({
    id: updated.id,
    name: updated.name,
    prompt: updated.prompt,
    description: updated.description,
    model: updated.model,
    avatarUrl: updated.avatarUrl,
    enabled: updated.enabled,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    owner: updated.owner,
    documents: updated.documents.map((link) => link.document),
  });
});

adminRouter.get("/guide", authenticate, requireAdmin, async (_req, res) => {
  const doc = await prisma.document.findFirst({
    where: { displayName: HELP_DOC_DISPLAY_NAME },
    orderBy: { createdAt: "desc" },
  });
  if (!doc) {
    res.status(404).json({ error: "Guide document not found" });
    return;
  }
  const files = Array.isArray(doc.sourceFiles) ? doc.sourceFiles : [];
  const file = files[0] || {};
  const text =
    typeof file?.text === "string"
      ? file.text
      : Array.isArray(file?.blocks)
        ? file.blocks.map((b) => (b?.text ?? "").trim()).filter(Boolean).join("\n\n")
        : "";
  res.json({ id: doc.id, displayName: doc.displayName, fileName: file?.name || "คู่มือการใช้งาน.txt", text });
});

adminRouter.patch("/guide", authenticate, requireAdmin, async (req, res) => {
  const { text, mode } = req.body ?? {};
  if (typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const doc = await prisma.document.findFirst({
    where: { displayName: HELP_DOC_DISPLAY_NAME },
    orderBy: { createdAt: "desc" },
  });
  if (!doc) {
    res.status(404).json({ error: "Guide document not found" });
    return;
  }
  const existingFiles = Array.isArray(doc.sourceFiles) ? doc.sourceFiles : [];
  const existingText = typeof existingFiles?.[0]?.text === "string" ? existingFiles[0].text : "";
  const nextText = mode === "append" ? `${existingText}${existingText ? "\n\n" : ""}${text}` : text;
  const preparedFiles = ensureSourceFileBlocks([{ name: "คู่มือการใช้งาน.txt", type: "text/plain", text: nextText }]);

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { sourceFiles: preparedFiles },
  });

  // Reindex so help bot answers reflect latest guide text
  await indexDocumentChunks({
    documentId: updated.id,
    userId: updated.ownerId,
    sourceFiles: preparedFiles,
  }).catch(() => null);
  await invalidateUserCaches(updated.ownerId);

  await logEvent({
    event: "admin.guide.updated",
    actorId: req.user.id,
    targetType: "document",
    targetId: updated.id,
    meta: { displayName: updated.displayName },
  });

  res.json({ ok: true, id: updated.id });
});

adminRouter.delete("/documents/:id", authenticate, requireRole("support", "admin"), async (req, res) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  await logEvent({
    event: "document.deleted",
    actorId: req.user.id,
    targetType: "document",
    targetId: document.id,
    meta: { displayName: document.displayName, ownerId: document.ownerId, ...getRequestContext(req) },
  });
  await prisma.document.delete({ where: { id: document.id } });
  res.json({ ok: true });
  deleteDocumentVectors(document.id).catch(() => null);
});

adminRouter.delete("/bots/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const bot = await prisma.bot.findUnique({
      where: { id: req.params.id },
      include: { owner: { select: { id: true, email: true } } },
    });
    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }
    await logEvent({
      event: "bot.deleted",
      actorId: req.user.id,
      targetType: "bot",
      targetId: bot.id,
      meta: { name: bot.name, ownerId: bot.ownerId, ...getRequestContext(req) },
    });
    await deleteBotWithCleanup(bot.id);
    res.json({ ok: true });
    await invalidateUserCaches(bot.ownerId);
  } catch (error) {
    console.error("Failed to delete bot (admin)", error);
    res.status(500).json({ error: "Failed to delete bot" });
  }
});

adminRouter.get("/upload-batches", authenticate, requireAdmin, async (_req, res) => {
  const batches = await prisma.uploadBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true } } },
    take: 100,
  });
  res.json(batches);
});

// Backup/Restore ปิดใช้งาน — ไม่มีหน้า UI ใน Supportadmin และเสี่ยงถ้าเปิด API ตรง
adminRouter.get("/backup", authenticate, requireAdmin, async (_req, res) => {
  res.status(410).json({ error: "Backup endpoint disabled — no admin UI" });
});

adminRouter.post("/restore", authenticate, requireAdmin, async (_req, res) => {
  res.status(410).json({ error: "Restore endpoint disabled — no admin UI" });
});
