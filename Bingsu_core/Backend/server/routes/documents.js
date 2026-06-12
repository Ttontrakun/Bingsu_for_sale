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
import {
  allowedUploadExtensions,
  allowedUploadMimeTypes,
  ocrLlmApiKey,
  ocrLlmProvider,
  qdrantCollectionName,
  storeRawFiles,
} from "../config.js";
import { deleteDocumentVectors, indexDocumentChunks } from "../services/vectorDb.js";
import { ensureSourceFileBlocks } from "../services/text.js";
import { runOcrExtract } from "../services/uploadQueue.js";
import { structureOcrTextWithLlm } from "../services/chat.js";
import { extractExcelText, isExcelFile } from "../services/excel.js";
import { invalidateAllRagCache, invalidateRagCacheForDocument } from "../services/rag.js";

export const documentsRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const runSingleUpload = (req, res) =>
  new Promise((resolve, reject) => {
    upload.single("file")(req, res, (err) => (err ? reject(err) : resolve()));
  });

const allowedShareRoles = new Set(["viewer", "editor"]);
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
  if (isStaffDocumentReader(user)) {
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

const normalizeExtension = (name = "") => {
  const normalizedName = String(name || "").trim().replace(/["']+$/g, "");
  return path.extname(normalizedName).toLowerCase().trim();
};
const isAllowedSourceFile = (file) => {
  if (!file || typeof file !== "object") return true;
  const name = file.name || file.fileName || "";
  const type = file.type || "";
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

documentsRouter.get("/", authenticate, async (req, res) => {
  const summary = ["1", "true", "yes"].includes(String(req.query.summary || "").toLowerCase());
  const documents = await prisma.document.findMany({
    where: {
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
        sourceFiles: stripSourceFiles(doc.sourceFiles),
      })),
    );
    return;
  }
  res.json(filtered);
});

documentsRouter.post("/", authenticate, async (req, res) => {
  const { displayName, sourceFiles, tags, link } = req.body ?? {};

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
    }
    await logEvent({
      event: "document.created",
      actorId: req.user.id,
      targetType: "document",
      targetId: document.id,
      meta: { displayName: document.displayName, ...getRequestContext(req) },
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

documentsRouter.get("/:id/shares", authenticate, async (req, res) => {
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, ownerId: req.user.id },
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

  res.json(document.shares);
});

documentsRouter.post("/:id/shares", authenticate, async (req, res) => {
  const { email, role } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }
  const desiredRole = role || "viewer";
  if (!allowedShareRoles.has(desiredRole)) {
    res.status(400).json({ error: "role must be viewer or editor" });
    return;
  }

  const document = await prisma.document.findFirst({
    where: { id: req.params.id, ownerId: req.user.id },
  });

  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.id === req.user.id) {
    res.status(400).json({ error: "Owner already has access" });
    return;
  }

  await prisma.documentShare.upsert({
    where: {
      documentId_userId: { documentId: document.id, userId: user.id },
    },
    update: { role: desiredRole },
    create: { documentId: document.id, userId: user.id, role: desiredRole },
  });

  const shares = await prisma.documentShare.findMany({
    where: { documentId: document.id },
    select: {
      id: true,
      role: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  res.json(shares);
  await invalidateUserCaches(req.user.id);
});

documentsRouter.delete("/:id/shares", authenticate, async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const document = await prisma.document.findFirst({
    where: { id: req.params.id, ownerId: req.user.id },
  });

  if (!document) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await prisma.documentShare.deleteMany({
    where: { documentId: document.id, userId: user.id },
  });

  const shares = await prisma.documentShare.findMany({
    where: { documentId: document.id },
    select: {
      id: true,
      role: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  res.json(shares);
  await invalidateUserCaches(req.user.id);
});

documentsRouter.post("/:id/files/ocr", authenticate, async (req, res) => {
  try {
    await runSingleUpload(req, res);
    const document = await prisma.document.findFirst({
      where: documentWhereById(req.params.id, req.user, { editorOnly: false }),
    });
    if (!document) {
      res.status(404).json({ ok: false, error: "Document not found" });
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
    const fileName = req.file.originalname || req.file.fieldname || "file";
    const contentType = req.file.mimetype || "application/octet-stream";
    const isExcel = isExcelFile({ fileName, contentType });
    const isPdf = contentType.toLowerCase().includes("pdf") || /\.pdf$/i.test(fileName);

    let body;
    if (isExcel) {
      const parsed = extractExcelText({ buffer: req.file.buffer, fileName });
      body = {
        text: parsed.text,
        blocks: parsed.blocks,
        metadata: { provider: "excel", source: "excel-parser", rowCount: parsed.blocks.length },
      };
    } else {
      const provider = isPdf ? "typhoon" : "paddle";
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

    const currentSourceFiles = Array.isArray(document.sourceFiles) ? document.sourceFiles : [];
    const mergedSourceFiles = [...currentSourceFiles, {
      name: fileName,
      type: contentType,
      text,
      blocks,
      metadata: body?.metadata || {},
    }];
    const prepared = ensureSourceFileBlocks(mergedSourceFiles);

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
      error: isMulterError ? `Upload failed: ${message}` : "OCR upload failed",
    });
  }
});

/** POST /api/documents/:id/files/ocr/structure-text — ปรับข้อความ OCR ด้วย AI แบบ conservative (แก้คำผิด/วรรคตอน ไม่เขียนใหม่) */
documentsRouter.post("/:id/files/ocr/structure-text", authenticate, async (req, res) => {
  try {
    const document = await prisma.document.findFirst({
      where: documentWhereById(req.params.id, req.user, { editorOnly: false }),
    });
    if (!document) {
      res.status(404).json({ ok: false, error: "Document not found" });
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
    if (ocrLlmProvider !== "ollama" && !ocrLlmApiKey) {
      res.status(503).json({
        ok: false,
        error: "ยังไม่ได้ตั้งค่า API สำหรับจัดเรียงด้วย AI — ตั้ง OCR_LLM_API_KEY หรือ OPENAI_API_KEY ใน Backend/.env",
      });
      return;
    }
    const structured = await structureOcrTextWithLlm(text.trim());
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

  res.json(document);
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
  const fileName = file?.name || `file-${index + 1}`;

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

  if (!isPathInsideRoot(localFilesRoot, filePath)) {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File missing on disk" });
    return;
  }

  res.download(filePath, fileName);
});
