import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { prisma } from "../db.js";
import { authenticate } from "../lib/auth.js";
import { getRequestContext } from "../lib/requestContext.js";
import { logEvent } from "../lib/logging.js";
import { invalidateUserCaches } from "../lib/cache.js";
import { isFeatureEnabled } from "../lib/systemConfig.js";
import {
  allowedUploadExtensions,
  allowedUploadMimeTypes,
  isAllowedChatModel,
  ocrLlmApiKey,
  ocrLlmProvider,
  resolveChatTargetForModel,
  qdrantCollectionName,
  storeRawFiles,
} from "../config.js";
import { deleteDocumentVectors, indexDocumentChunks } from "../services/vectorDb.js";
import { ensureSourceFileBlocks } from "../services/text.js";
import { runOcrExtract } from "../services/uploadQueue.js";
import { structureOcrTextWithLlm } from "../services/chat.js";
import { extractExcelText, isExcelFile } from "../services/excel.js";
import { invalidateAllRagCache, invalidateRagCacheForDocument } from "../services/rag.js";
import { storeOriginalFile } from "../services/fileStorage.js";
import { decodeUploadFileName, repairStoredFileName } from "../lib/fileNameEncoding.js";

export const documentsRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const runSingleUpload = (req, res) =>
  new Promise((resolve, reject) => {
    upload.single("file")(req, res, (err) => (err ? reject(err) : resolve()));
  });

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 32;

/** Support / Admin แก้ Knowledge ใดก็ได้ (เดิมจำกัดเฉพาะ owner) */
const STAFF_DOC_READ_ROLES = new Set(["support", "admin", "admin_metrics"]);
const STAFF_DOC_WRITE_ROLES = new Set(["support", "admin"]);
const isStaffDocumentReader = (user) => user && STAFF_DOC_READ_ROLES.has(String(user.role || ""));
const isStaffDocumentWriter = (user) => user && STAFF_DOC_WRITE_ROLES.has(String(user.role || ""));

/** ค้นหาเอกสารตาม id — staff เห็นทุกฉบับ, user เห็นเฉพาะของตัวเองหรือที่ถูกแชร์ */
const documentWhereById = (documentId, user, { editorOnly = false } = {}) => {
  const id = documentId;
  if (editorOnly) {
    if (isStaffDocumentWriter(user)) return { id };
  } else if (isStaffDocumentReader(user)) {
    return { id };
  }
  const or = editorOnly
    ? [{ ownerId: user.id }, { shares: { some: { userId: user.id, role: "editor" } } }]
    : [{ ownerId: user.id }, { shares: { some: { userId: user.id } } }];
  return { id, OR: or };
};

const stripSourceFiles = (sourceFiles) => {
  if (!Array.isArray(sourceFiles)) return sourceFiles;
  return sourceFiles.map((file) => {
    if (!file || typeof file !== "object") return file;
    const { text, blocks, ...rest } = file;
    return rest;
  });
};

/**
 * ไฟล์เก่าบางไฟล์ถูกบันทึกชื่อไว้ตอนที่ยังไม่ decode multipart เป็น UTF-8
 * ชื่อไทยเลยกลายเป็น mojibake (à¸„à¹ˆà¸²...) — ซ่อมตอนส่งออก API ให้ทุกหน้าเห็นชื่อที่ถูก
 */
const FILE_NAME_FIELDS = ["name", "fileName", "originalName", "displayName"];
const repairSourceFileNames = (sourceFiles) => {
  const repairOne = (file) => {
    if (!file || typeof file !== "object") return file;
    let changed = false;
    const next = { ...file };
    for (const key of FILE_NAME_FIELDS) {
      const value = next[key];
      if (typeof value !== "string" || !value) continue;
      const repaired = repairStoredFileName(value, value);
      if (repaired !== value) {
        next[key] = repaired;
        changed = true;
      }
    }
    return changed ? next : file;
  };
  if (Array.isArray(sourceFiles)) return sourceFiles.map(repairOne);
  if (typeof sourceFiles === "string") {
    try {
      const parsed = JSON.parse(sourceFiles);
      if (Array.isArray(parsed)) return JSON.stringify(parsed.map(repairOne));
    } catch {
      /* keep as-is */
    }
  }
  return sourceFiles;
};
const withRepairedFileNames = (document) => (
  document && typeof document === "object"
    ? { ...document, sourceFiles: repairSourceFileNames(document.sourceFiles) }
    : document
);

const normalizeExtension = (name = "") => {
  const normalizedName = String(name || "").trim().replace(/["']+$/g, "");
  return path.extname(normalizedName).toLowerCase().trim();
};
const isAllowedSourceFile = (file) => {
  if (!file || typeof file !== "object") return true;
  const name = file.name || file.fileName || "";
  const type = file.type || "";
  if (isExcelFile({ fileName: name, contentType: type })) return true;
  const ext = normalizeExtension(name);
  const hasAllowedExt = ext ? allowedUploadExtensions.includes(ext) : false;
  const hasAllowedType = type ? allowedUploadMimeTypes.includes(String(type)) : false;
  return !(type || ext) || hasAllowedExt || hasAllowedType;
};

const normalizeTags = (tags = []) => {
  const normalized = tags
    .filter((tag) => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.slice(0, MAX_TAG_LENGTH));
  const seen = new Set();
  const deduped = [];
  for (const tag of normalized) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tag);
    if (deduped.length >= MAX_TAGS) break;
  }
  return deduped;
};

const parseTags = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  return normalizeTags(value);
};

const localFilesRoot = path.join(process.cwd(), ".files");
const isPathInsideRoot = (root, candidate) => {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(rootWithSep);
};

const HELP_DOC_DISPLAY_NAME = "คู่มือการใช้งาน";
const normalizeDisplayName = (value) => String(value || "").trim();

/**
 * เมื่อ support/admin อัปโหลดเอกสารและ index ลง vector แล้ว
 * ให้ share เอกสารนั้นกับ user ทุกคนและ link เข้า bot หลักของ user แต่ละคน
 */
async function propagateStaffDocumentToUsers(documentId) {
  try {
    const users = await prisma.user.findMany({
      where: { role: "user", approvalStatus: "approved", isActive: true },
      select: { id: true },
    });
    if (!users.length) return;

    const DEFAULT_BOT_NAME = "บอทช่วยสอน";
    for (const user of users) {
      // Share เอกสารกับ user (viewer) — upsert เพื่อไม่ duplicate
      await prisma.documentShare.upsert({
        where: { documentId_userId: { documentId, userId: user.id } },
        update: {},
        create: { documentId, userId: user.id, role: "viewer" },
      }).catch(() => null);

      // หา default bot ของ user (ไม่ใช่บอทช่วยสอน)
      const bot = await prisma.bot.findFirst({
        where: { ownerId: user.id, name: { not: DEFAULT_BOT_NAME } },
        select: { id: true },
      });
      if (!bot) continue;

      // Link document เข้า bot — upsert เพื่อไม่ duplicate
      await prisma.botDocument.upsert({
        where: { botId_documentId: { botId: bot.id, documentId } },
        update: {},
        create: { botId: bot.id, documentId },
      }).catch(() => null);
    }
    console.log(`[documents] propagated doc ${documentId} to ${users.length} user(s)`);
  } catch (err) {
    console.error("[documents] propagateStaffDocumentToUsers failed:", err?.message);
  }
}

/**
 * เชื่อมเอกสารเข้ากับ "บอทในระบบ" อัตโนมัติ (ยกเว้นบอทช่วยสอน)
 * ระบบนี้มีบอทหลักตัวเดียว — เมื่อ support/admin บันทึก Knowledge จะผูกเข้าบอทนั้นให้เลย
 * ไม่ต้องเข้าไปหน้าบอทเพื่อเลือก Knowledge อีกครั้ง (upsert กันซ้ำ)
 */
async function linkDocumentToSystemBots(documentId) {
  try {
    const bots = await prisma.bot.findMany({
      where: { name: { not: "บอทช่วยสอน" } },
      select: { id: true },
    });
    for (const b of bots) {
      await prisma.botDocument.upsert({
        where: { botId_documentId: { botId: b.id, documentId } },
        update: {},
        create: { botId: b.id, documentId },
      }).catch(() => null);
    }
    if (bots.length) {
      console.log(`[documents] linked doc ${documentId} to ${bots.length} system bot(s)`);
    }
  } catch (err) {
    console.error("[documents] linkDocumentToSystemBots failed:", err?.message);
  }
}

documentsRouter.get("/", authenticate, async (req, res) => {
  const summary = ["1", "true", "yes"].includes(String(req.query.summary || "").toLowerCase());
  // ผู้ใช้ทั่วไปเห็นเฉพาะ Knowledge ที่ตัวเองเป็นเจ้าของ — ไม่โชว์เอกสารที่ Support/Admin แชร์เข้ามา
  const isEndUser = req.user?.role === "user";
  const documents = await prisma.document.findMany({
    where: isEndUser
      ? { ownerId: req.user.id }
      : {
          OR: [
            { ownerId: req.user.id },
            { shares: { some: { userId: req.user.id } } },
          ],
        },
    orderBy: { createdAt: "desc" },
    ...(summary
      ? {
          select: {
            id: true,
            displayName: true,
            ragStoreName: true,
            sourceFiles: true,
            createdAt: true,
            ownerId: true,
            tags: true,
            link: true,
            shares: {
              select: {
                id: true,
                role: true,
                user: { select: { id: true, email: true, name: true } },
              },
            },
          },
        }
      : {
          include: {
            shares: {
              select: {
                id: true,
                role: true,
                user: { select: { id: true, email: true, name: true } },
              },
            },
          },
        }),
  });
  // ไม่โชว์คู่มือการใช้งานในหน้ารายการ Knowledge (ใช้เบื้องหลังสำหรับ 3 ปุ่มบอทช่วยสอน)
  const filtered = documents.filter((d) => d.displayName !== HELP_DOC_DISPLAY_NAME);
  if (summary) {
    res.json(
      filtered.map((doc) => ({
        ...doc,
        sourceFiles: stripSourceFiles(repairSourceFileNames(doc.sourceFiles)),
      })),
    );
    return;
  }
  res.json(filtered.map(withRepairedFileNames));
});

documentsRouter.post("/", authenticate, async (req, res) => {
  const { displayName, sourceFiles, tags, link } = req.body ?? {};

  // ผู้ใช้ทั่วไปอัปโหลดความรู้ได้เมื่อ Admin Dev เปิดเมนู/feature นี้เท่านั้น
  if (req.user?.role === "user") {
    const allowed = await isFeatureEnabled("user.uploadDocuments");
    if (!allowed) {
      res.status(403).json({ error: "ฟีเจอร์อัปโหลดเอกสารยังไม่ได้เปิดใช้งาน" });
      return;
    }
  }

  if (!displayName || !sourceFiles) {
    res.status(400).json({ error: "displayName and sourceFiles are required" });
    return;
  }
  const normalizedDisplayName = normalizeDisplayName(displayName);
  if (!normalizedDisplayName) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }
  const duplicate = await prisma.document.findFirst({
    where: {
      ownerId: req.user.id,
      displayName: { equals: normalizedDisplayName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    res.status(409).json({ error: "ชื่อ Knowledge นี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น" });
    return;
  }

  if (!Array.isArray(sourceFiles) || sourceFiles.some((file) => !isAllowedSourceFile(file))) {
    res.status(400).json({ error: "Unsupported file type" });
    return;
  }
  const normalizedTags = parseTags(tags);
  if (normalizedTags === null) {
    res.status(400).json({ error: "tags must be an array" });
    return;
  }
  const normalizedLink = typeof link === "string" ? link.trim().slice(0, 2048) : null;
  const preparedFiles = ensureSourceFileBlocks(sourceFiles);
  const document = await prisma.document.create({
    data: {
      displayName: normalizedDisplayName,
      ragStoreName: qdrantCollectionName,
      sourceFiles: preparedFiles,
      ownerId: req.user.id,
      tags: normalizedTags ?? [],
      link: normalizedLink || null,
    },
  });

  try {
    await indexDocumentChunks({
      documentId: document.id,
      userId: req.user.id,
      sourceFiles: preparedFiles,
    });
    if (isStaffDocumentWriter(req.user)) {
      await propagateStaffDocumentToUsers(document.id);
      // เฉพาะฝั่ง support/admin → เชื่อม Knowledge เข้าบอทในระบบให้อัตโนมัติ (ไม่เกี่ยวกับ user)
      await linkDocumentToSystemBots(document.id);
    }
    const isUserActor = req.user?.role === "user";
    await logEvent({
      event: isUserActor ? "user.knowledge.created" : "document.created",
      actorId: req.user.id,
      targetType: "document",
      targetId: document.id,
      meta: {
        displayName: document.displayName,
        actorRole: req.user?.role || null,
        actorEmail: req.user?.email || null,
        actorName: req.user?.name || null,
        createdAt: document.createdAt?.toISOString?.() || new Date().toISOString(),
        ...getRequestContext(req),
      },
    });
    await invalidateUserCaches(req.user.id);
    res.status(201).json(document);
  } catch (error) {
    await prisma.document.delete({ where: { id: document.id } }).catch(() => null);
    res.status(500).json({ error: "Failed to index document" });
    return;
  }
});

documentsRouter.delete("/:id", authenticate, async (req, res) => {
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, ownerId: req.user.id },
  });

  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (document.displayName === HELP_DOC_DISPLAY_NAME) {
    res.status(403).json({ error: "ไม่สามารถลบคู่มือการใช้งานได้" });
    return;
  }

  // Best-effort cleanup: remove stored original files for this document (if any)
  const localDocDir = path.join(localFilesRoot, req.user.id, document.id);
  fsPromises.rm(localDocDir, { recursive: true, force: true }).catch(() => null);

  await prisma.document.delete({ where: { id: document.id } });
  const isUserActor = req.user?.role === "user";
  await logEvent({
    event: isUserActor ? "user.knowledge.deleted" : "document.deleted",
    actorId: req.user.id,
    targetType: "document",
    targetId: document.id,
    meta: {
      displayName: document.displayName,
      actorRole: req.user?.role || null,
      actorEmail: req.user?.email || null,
      actorName: req.user?.name || null,
      deletedAt: new Date().toISOString(),
      ...getRequestContext(req),
    },
  }).catch(() => null);
  res.json({ ok: true });
  deleteDocumentVectors(document.id).catch(() => null);
  invalidateRagCacheForDocument(document.id);
  invalidateAllRagCache();
  await invalidateUserCaches(req.user.id);
});

documentsRouter.patch("/:id", authenticate, async (req, res) => {
  const { displayName, sourceFiles, tags, link } = req.body ?? {};

  if (!displayName && !sourceFiles && tags === undefined && link === undefined) {
    res.status(400).json({ error: "displayName, sourceFiles, tags, or link is required" });
    return;
  }

  const document = await prisma.document.findFirst({
    where: documentWhereById(req.params.id, req.user, { editorOnly: true }),
    include: { owner: { select: { role: true } } },
  });

  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (!isStaffDocumentWriter(req.user) && document.displayName === HELP_DOC_DISPLAY_NAME) {
    res.status(403).json({ error: "ไม่สามารถแก้ไขคู่มือการใช้งานได้" });
    return;
  }

  if (sourceFiles && (!Array.isArray(sourceFiles) || sourceFiles.some((file) => !isAllowedSourceFile(file)))) {
    res.status(400).json({ error: "Unsupported file type" });
    return;
  }
  const normalizedTags = parseTags(tags);
  if (normalizedTags === null) {
    res.status(400).json({ error: "tags must be an array" });
    return;
  }
  const normalizedLink = link === undefined
    ? undefined
    : typeof link === "string"
      ? link.trim().slice(0, 2048) || null
      : null;
  const preparedFiles = sourceFiles ? ensureSourceFileBlocks(sourceFiles) : undefined;
  if (displayName !== undefined) {
    const normalizedDisplayName = normalizeDisplayName(displayName);
    if (!normalizedDisplayName) {
      res.status(400).json({ error: "displayName is required" });
      return;
    }
    const duplicate = await prisma.document.findFirst({
      where: {
        ownerId: document.ownerId,
        id: { not: document.id },
        displayName: { equals: normalizedDisplayName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      res.status(409).json({ error: "ชื่อ Knowledge นี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น" });
      return;
    }
  }
  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      displayName: displayName !== undefined ? normalizeDisplayName(displayName) : undefined,
      sourceFiles: preparedFiles ?? undefined,
      tags: normalizedTags ?? undefined,
      link: normalizedLink,
    },
    include: {
      shares: {
        select: {
          id: true,
          role: true,
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (preparedFiles) {
    await deleteDocumentVectors(updated.id).catch(() => null);
    try {
      await indexDocumentChunks({
        documentId: updated.id,
        userId: document.ownerId,
        sourceFiles: preparedFiles,
      });
      invalidateRagCacheForDocument(updated.id);
      invalidateAllRagCache();
      // ถ้า owner เป็น support/admin → share และ link bot ให้ user ทุกคนอัตโนมัติ
      if (isStaffDocumentWriter({ role: document.owner?.role ?? req.user.role })) {
        await propagateStaffDocumentToUsers(updated.id);
      }
      // เฉพาะฝั่ง support/admin (operator เป็น staff) → เชื่อม Knowledge เข้าบอทในระบบให้อัตโนมัติ
      // ไม่เกี่ยวกับ user ทั่วไป (user บันทึก Knowledge จะไม่ถูกเชื่อมเข้าบอทระบบ)
      if (isStaffDocumentWriter(req.user)) {
        await linkDocumentToSystemBots(updated.id);
      }
      await logEvent({
        event: "document.updated",
        actorId: req.user.id,
        targetType: "document",
        targetId: updated.id,
        meta: {
          displayName: updated.displayName,
          changed: {
            displayName: displayName !== undefined,
            sourceFiles: sourceFiles !== undefined,
            tags: tags !== undefined,
            link: link !== undefined,
          },
          sourceFileCount: Array.isArray(sourceFiles) ? sourceFiles.length : undefined,
        },
      });
    } catch (embedErr) {
      const msg = embedErr?.message || String(embedErr);
      // คีย์ใช้ได้แค่บางโมเดล — แนะนำให้ตั้ง EMBEDDING_MODEL ใน .env
      const hint = /key not allowed to access model|only access models=\[.+\]/.test(msg)
        ? " แก้ใน Backend/.env: ตั้ง EMBEDDING_MODEL ให้ตรงกับโมเดลที่คีย์รองรับ (เช่น Qwen3-Embedding-4B)"
        : "";
      await logEvent({
        event: "document.vectorize.failed",
        actorId: req.user.id,
        targetType: "document",
        targetId: updated.id,
        meta: {
          displayName: updated.displayName,
          error: msg,
        },
      });
      res.status(500).json({
        error: `การแปลงเป็น Vector ล้มเหลว: ${msg}${hint}`,
      });
      return;
    }
  }

  res.json(updated);
  await invalidateUserCaches(document.ownerId);
});

const sharesDisabled = (_req, res) => {
  res.status(410).json({ error: "Document shares endpoint disabled — no UI" });
};
documentsRouter.get("/:id/shares", authenticate, sharesDisabled);
documentsRouter.post("/:id/shares", authenticate, sharesDisabled);
documentsRouter.delete("/:id/shares", authenticate, sharesDisabled);

documentsRouter.post("/:id/files/ocr", authenticate, async (req, res) => {
  try {
    await runSingleUpload(req, res);
    const document = await prisma.document.findFirst({
      where: documentWhereById(req.params.id, req.user, { editorOnly: true }),
    });
    if (!document) {
      res.status(404).json({ ok: false, error: "Document not found or no edit permission" });
      return;
    }
    if (!isStaffDocumentWriter(req.user) && document.displayName === HELP_DOC_DISPLAY_NAME) {
      res.status(403).json({ ok: false, error: "ไม่สามารถอัปโหลดไฟล์ในคู่มือการใช้งานผ่านหน้านี้ได้" });
      return;
    }
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ ok: false, error: "ไม่มีไฟล์" });
      return;
    }
    const fileName = decodeUploadFileName(req.file.originalname || req.file.fieldname || "file");
    const contentType = req.file.mimetype || "application/octet-stream";
    const isExcel = isExcelFile({ fileName, contentType });
    const isPdf = contentType.toLowerCase().includes("pdf") || /\.pdf$/i.test(fileName);

    let body;
    if (isExcel) {
      const parsed = extractExcelText({ buffer: req.file.buffer, fileName });
      body = {
        text: parsed.text,
        blocks: parsed.blocks,
        metadata: {
          ...(parsed.metadata && typeof parsed.metadata === "object" ? parsed.metadata : {}),
          provider: "excel",
          source: "excel-parser",
          rowCount: Array.isArray(parsed.blocks) ? parsed.blocks.length : 0,
        },
      };
    } else {
      const configuredProviderRaw = (process.env.OCR_PROVIDER || "paddle").trim().toLowerCase();
      const provider = ["typhoon", "paddle", "paddle_vl", "text"].includes(configuredProviderRaw)
        ? configuredProviderRaw
        : "paddle";
      body = await runOcrExtract({
        buffer: req.file.buffer,
        fileName,
        contentType,
        provider,
      });
    }

    const text = (body?.text || "").trim();
    const blocks = Array.isArray(body?.blocks) && body.blocks.length > 0
      ? body.blocks
      : (text ? [{ text, label: "Content" }] : []);

    if (!text && blocks.length === 0) {
      res.status(400).json({ ok: false, error: "OCR ไม่พบข้อความในไฟล์นี้" });
      return;
    }

    let storage = null;
    if (storeRawFiles) {
      try {
        storage = await storeOriginalFile({
          buffer: req.file.buffer,
          fileName,
          contentType,
          userId: document.ownerId,
          documentId: document.id,
        });
      } catch (storeErr) {
        console.error("[documents] store original after OCR failed:", storeErr?.message || storeErr);
      }
    }

    const currentSourceFiles = Array.isArray(document.sourceFiles) ? document.sourceFiles : [];
    const fileEntry = {
      name: fileName,
      type: contentType,
      size: req.file.size || req.file.buffer?.length || undefined,
      text,
      blocks,
      metadata: body?.metadata || {},
      ...(storage ? { storage, hasOriginal: true, originalName: fileName, originalType: contentType } : {}),
    };
    const mergedSourceFiles = [...currentSourceFiles, fileEntry];
    const prepared = ensureSourceFileBlocks(mergedSourceFiles);
    const fileIndex = prepared.length - 1;

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: { sourceFiles: prepared },
    });

    await deleteDocumentVectors(updated.id).catch(() => null);
    await indexDocumentChunks({
      documentId: updated.id,
      userId: updated.ownerId,
      sourceFiles: prepared,
    });
    invalidateRagCacheForDocument(updated.id);
    invalidateAllRagCache();
    await invalidateUserCaches(updated.ownerId);

    res.json({
      ok: true,
      filename: fileName,
      text,
      blocks,
      metadata: body?.metadata || {},
      storage: storage || null,
      hasOriginal: Boolean(storage),
      fileIndex,
      document: {
        id: updated.id,
        displayName: updated.displayName,
      },
    });
  } catch (error) {
    const message = error?.message || String(error);
    const isMulterError = error?.name === "MulterError";
    console.error("[documents] /:id/files/ocr error:", message);
    res.status(isMulterError ? 400 : 500).json({
      ok: false,
      error: isMulterError ? `Upload failed: ${message}` : message || "OCR upload failed",
    });
  }
});

/** POST /api/documents/:id/files/:index/original — แนบ PDF/Excel ต้นฉบับทีหลัง (ไม่ทับ OCR) */
documentsRouter.post("/:id/files/:index/original", authenticate, async (req, res) => {
  try {
    if (!storeRawFiles) {
      res.status(400).json({ ok: false, error: "การเก็บไฟล์ต้นฉบับถูกปิดอยู่ (STORE_RAW_FILES)" });
      return;
    }
    await runSingleUpload(req, res);
    const index = Number(req.params.index);
    if (!Number.isFinite(index) || index < 0) {
      res.status(400).json({ ok: false, error: "Invalid file index" });
      return;
    }
    const document = await prisma.document.findFirst({
      where: documentWhereById(req.params.id, req.user, { editorOnly: true }),
    });
    if (!document) {
      res.status(404).json({ ok: false, error: "Document not found or no edit permission" });
      return;
    }
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ ok: false, error: "ไม่มีไฟล์" });
      return;
    }
    const sourceFiles = Array.isArray(document.sourceFiles) ? [...document.sourceFiles] : [];
    if (!sourceFiles[index]) {
      res.status(404).json({ ok: false, error: "File not found" });
      return;
    }
    const fileName = decodeUploadFileName(req.file.originalname || req.file.fieldname || "file");
    const contentType = req.file.mimetype || "application/octet-stream";
    const storage = await storeOriginalFile({
      buffer: req.file.buffer,
      fileName,
      contentType,
      userId: document.ownerId,
      documentId: document.id,
    });
    const prev = sourceFiles[index] && typeof sourceFiles[index] === "object" ? sourceFiles[index] : {};
    sourceFiles[index] = {
      ...prev,
      storage,
      hasOriginal: true,
      originalName: fileName,
      originalType: contentType,
      size: req.file.size || req.file.buffer?.length || prev.size,
    };
    const prepared = ensureSourceFileBlocks(sourceFiles);
    const updated = await prisma.document.update({
      where: { id: document.id },
      data: { sourceFiles: prepared },
    });
    await invalidateUserCaches(updated.ownerId);
    res.json({
      ok: true,
      fileIndex: index,
      storage,
      hasOriginal: true,
      originalName: fileName,
      originalType: contentType,
      document: { id: updated.id, displayName: updated.displayName },
    });
  } catch (error) {
    const message = error?.message || String(error);
    const isMulterError = error?.name === "MulterError";
    console.error("[documents] /:id/files/:index/original error:", message);
    res.status(isMulterError ? 400 : 500).json({
      ok: false,
      error: isMulterError ? `Upload failed: ${message}` : message || "Attach original failed",
    });
  }
});

/** POST /api/documents/:id/files/ocr/structure-text — ปรับข้อความ OCR ด้วย AI แบบ conservative (แก้คำผิด/วรรคตอน ไม่เขียนใหม่) */
documentsRouter.post("/:id/files/ocr/structure-text", authenticate, async (req, res) => {
  try {
    const document = await prisma.document.findFirst({
      where: documentWhereById(req.params.id, req.user, { editorOnly: true }),
    });
    if (!document) {
      res.status(404).json({ ok: false, error: "Document not found or no edit permission" });
      return;
    }
    if (!isStaffDocumentWriter(req.user) && document.displayName === HELP_DOC_DISPLAY_NAME) {
      res.status(403).json({ ok: false, error: "ไม่สามารถแก้ไขคู่มือการใช้งานผ่านหน้านี้ได้" });
      return;
    }
    const raw = req.body?.text;
    const text = typeof raw === "string" ? raw : "";
    if (!text.trim()) {
      res.status(400).json({ ok: false, error: "ไม่มีข้อความ" });
      return;
    }
    const maxLen = Number(process.env.OCR_STRUCTURE_TEXT_MAX_CHARS || 400000);
    if (text.length > maxLen) {
      res.status(400).json({ ok: false, error: `ข้อความยาวเกิน ${maxLen} ตัวอักษร` });
      return;
    }
    const modelId = typeof req.body?.model === "string" ? req.body.model.trim() : "";
    if (modelId && !isAllowedChatModel(modelId)) {
      res.status(400).json({ ok: false, error: "โมเดลที่เลือกใช้ไม่ได้" });
      return;
    }
    if (ocrLlmProvider !== "ollama" && !ocrLlmApiKey && !resolveChatTargetForModel(modelId)) {
      res.status(503).json({
        ok: false,
        error: "ยังไม่ได้ตั้งค่า API สำหรับจัดเรียงด้วย AI — ตั้ง OCR_LLM_API_KEY หรือ OPENAI_API_KEY ใน Backend/.env",
      });
      return;
    }
    const structured = await structureOcrTextWithLlm(text.trim(), { modelId });
    // Log แบบ action-level: มีผู้ใช้สั่งจัดเรียงข้อความด้วย AI (เก็บเฉพาะ metadata ไม่เก็บเนื้อหา)
    logEvent({
      event: "document.ocr.structured",
      actorId: req.user?.id,
      targetType: "document",
      targetId: document.id,
      meta: { displayName: document.displayName, inputChars: text.trim().length, model: modelId || "default", ...getRequestContext(req) },
    }).catch(() => {});
    res.json({ ok: true, text: structured });
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[documents] OCR structure-text error:", msg);
    res.status(503).json({ ok: false, error: msg });
  }
});

documentsRouter.get("/:id", authenticate, async (req, res) => {
  const document = await prisma.document.findFirst({
    where: documentWhereById(req.params.id, req.user, { editorOnly: false }),
    include: {
      shares: {
        select: {
          id: true,
          role: true,
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(withRepairedFileNames(document));
});

documentsRouter.get("/:id/files/:index/download", authenticate, async (req, res) => {
  if (!storeRawFiles) {
    // Privacy mode: we do not store original files.
    res.status(404).json({ error: "Original file storage is disabled" });
    return;
  }

  const index = Number(req.params.index);
  if (!Number.isFinite(index) || index < 0) {
    res.status(400).json({ error: "Invalid file index" });
    return;
  }

  const document = await prisma.document.findFirst({
    where: documentWhereById(req.params.id, req.user, { editorOnly: false }),
  });
  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const sourceFiles = Array.isArray(document.sourceFiles) ? document.sourceFiles : [];
  const file = sourceFiles[index];
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  const storage = file?.storage || null;
  const fileName = repairStoredFileName(file?.name || `file-${index + 1}`);
  const inline = String(req.query.inline || "") === "1" || String(req.query.inline || "").toLowerCase() === "true";
  const downloadName = repairStoredFileName(file?.originalName || fileName);
  let contentType = file?.originalType || file?.type || "application/octet-stream";
  if (/\.pdf$/i.test(downloadName) && (!contentType || contentType === "application/octet-stream")) {
    contentType = "application/pdf";
  }

  if (storage?.provider === "s3") {
    if (storage.url) {
      res.redirect(String(storage.url));
      return;
    }
    res.status(400).json({ error: "File is not publicly accessible (missing storage.url)" });
    return;
  }

  const filePath = storage?.path;
  if (!filePath || typeof filePath !== "string") {
    res.status(404).json({ error: "Original file not available" });
    return;
  }

  // Scope downloads to this document's owner tree under .files/ (block cross-user path IDOR)
  const ownerScopedRoot = path.join(localFilesRoot, String(document.ownerId || ""));
  const docScopedRoot = path.join(ownerScopedRoot, String(document.id || ""));
  const allowedRoot = fs.existsSync(docScopedRoot) ? docScopedRoot : ownerScopedRoot;
  if (!isPathInsideRoot(localFilesRoot, filePath) || !isPathInsideRoot(allowedRoot, filePath)) {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File missing on disk" });
    return;
  }

  if (inline) {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.download(filePath, downloadName);
});

/** GET /api/documents/:id/files/:index/excel-preview — พรีวิวชีตจากไฟล์ต้นฉบับ Excel/CSV */
documentsRouter.get("/:id/files/:index/excel-preview", authenticate, async (req, res) => {
  if (!storeRawFiles) {
    res.status(404).json({ ok: false, error: "Original file storage is disabled" });
    return;
  }
  const index = Number(req.params.index);
  if (!Number.isFinite(index) || index < 0) {
    res.status(400).json({ ok: false, error: "Invalid file index" });
    return;
  }
  const document = await prisma.document.findFirst({
    where: documentWhereById(req.params.id, req.user, { editorOnly: false }),
  });
  if (!document) {
    res.status(404).json({ ok: false, error: "Document not found" });
    return;
  }
  const sourceFiles = Array.isArray(document.sourceFiles) ? document.sourceFiles : [];
  const file = sourceFiles[index];
  if (!file) {
    res.status(404).json({ ok: false, error: "File not found" });
    return;
  }
  const displayName = repairStoredFileName(file?.originalName || file?.name || `file-${index + 1}`);
  const contentType = file?.originalType || file?.type || "";
  if (!isExcelFile({ fileName: displayName, contentType })) {
    res.status(400).json({ ok: false, error: "ไฟล์นี้ไม่ใช่ Excel/CSV" });
    return;
  }
  const storage = file?.storage || null;
  if (!storage || storage.provider === "s3") {
    res.status(404).json({
      ok: false,
      error: storage?.provider === "s3"
        ? "ยังไม่รองรับพรีวิว Excel จาก S3 ในรอบนี้ — ใช้ดาวน์โหลดแทน"
        : "Original file not available",
    });
    return;
  }
  const filePath = storage?.path;
  if (!filePath || typeof filePath !== "string") {
    res.status(404).json({ ok: false, error: "Original file not available" });
    return;
  }
  const ownerScopedRoot = path.join(localFilesRoot, String(document.ownerId || ""));
  const docScopedRoot = path.join(ownerScopedRoot, String(document.id || ""));
  const allowedRoot = fs.existsSync(docScopedRoot) ? docScopedRoot : ownerScopedRoot;
  if (!isPathInsideRoot(localFilesRoot, filePath) || !isPathInsideRoot(allowedRoot, filePath)) {
    res.status(400).json({ ok: false, error: "Invalid file path" });
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ ok: false, error: "File missing on disk" });
    return;
  }
  try {
    const buffer = await fsPromises.readFile(filePath);
    const parsed = extractExcelText({ buffer, fileName: displayName });
    const sheets = Array.isArray(parsed?.metadata?.previewSheets) ? parsed.metadata.previewSheets : [];
    res.json({
      ok: true,
      name: displayName,
      sheets,
      sheetCount: sheets.length,
      rowCount: parsed?.metadata?.rowCount || 0,
    });
  } catch (error) {
    console.error("[documents] excel-preview error:", error?.message || error);
    res.status(500).json({ ok: false, error: error?.message || "Excel preview failed" });
  }
});
