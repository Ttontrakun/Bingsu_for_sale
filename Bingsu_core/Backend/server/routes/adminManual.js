/**
 * Manual page CRUD for Supportadmin — JSON tree + PDF upload
 */
import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";
import { prisma } from "../db.js";
import { authenticate, requireAdmin, requireRole } from "../lib/auth.js";
import { logEvent } from "../lib/logging.js";

export const adminManualRouter = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const manualUploadsDir = path.join(projectRoot, "uploads", "manual");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const MANUAL_ID = "default";

const DEFAULT_PAYLOAD = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/manualDefault.json"), "utf8"),
);

const CONTENT_TYPES = new Set(["text", "list", "price", "pdf"]);

const sanitizeContentItem = (item) => {
  if (!item || typeof item !== "object") return null;
  const type = String(item.type || "").trim();
  if (!CONTENT_TYPES.has(type)) return null;
  if (type === "text" || type === "price") {
    return { type, value: typeof item.value === "string" ? item.value : String(item.value ?? "") };
  }
  if (type === "list") {
    const items = Array.isArray(item.items)
      ? item.items.map((x) => String(x ?? "")).filter((x) => x.trim())
      : [];
    return { type, items };
  }
  // pdf
  const file = typeof item.file === "string" ? item.file.trim() : "";
  if (!file) return null;
  if (file.startsWith("blob:")) return null;
  return { type: "pdf", file };
};

const sanitizeSubcategory = (sub) => {
  if (!sub || typeof sub !== "object") return null;
  const id = String(sub.id || "").trim() || crypto.randomUUID();
  const title = String(sub.title || "").trim() || "หัวข้อย่อย";
  const content = Array.isArray(sub.content)
    ? sub.content.map(sanitizeContentItem).filter(Boolean)
    : [];
  return { id, title, content };
};

const sanitizeDocument = (doc) => {
  if (!doc || typeof doc !== "object") return null;
  const id = String(doc.id || "").trim() || crypto.randomUUID();
  const type = doc.type === "pdf" ? "pdf" : "content";
  const title = String(doc.title || "").trim() || "หัวข้อหลัก";
  const description = String(doc.description || "").trim();
  const iconKey = String(doc.iconKey || "form").trim() || "form";
  const iconBg = String(doc.iconBg || "bg-yellow-100").trim() || "bg-yellow-100";
  const iconColor = String(doc.iconColor || "text-yellow-500").trim() || "text-yellow-500";
  const out = { id, type, title, description, iconKey, iconBg, iconColor };
  if (type === "pdf") {
    const file = typeof doc.file === "string" ? doc.file.trim() : "";
    if (file && !file.startsWith("blob:")) out.file = file;
    else out.file = "";
  } else {
    out.subcategories = Array.isArray(doc.subcategories)
      ? doc.subcategories.map(sanitizeSubcategory).filter(Boolean)
      : [];
  }
  return out;
};

const sanitizePayload = (body) => {
  const docs = Array.isArray(body?.documents) ? body.documents : null;
  if (!docs) return null;
  return { documents: docs.map(sanitizeDocument).filter(Boolean) };
};

const ensureManualRow = async () => {
  const existing = await prisma.manualPage.findUnique({ where: { id: MANUAL_ID } });
  if (existing) return existing;
  return prisma.manualPage.create({
    data: { id: MANUAL_ID, payload: DEFAULT_PAYLOAD },
  });
};

adminManualRouter.get("/manual", authenticate, requireRole("support", "admin"), async (_req, res) => {
  try {
    const row = await ensureManualRow();
    const payload = row.payload && typeof row.payload === "object" ? row.payload : DEFAULT_PAYLOAD;
    res.json({
      id: row.id,
      documents: Array.isArray(payload.documents) ? payload.documents : [],
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    });
  } catch (error) {
    console.error("[manual] get failed", error);
    res.status(500).json({ error: "Failed to load manual" });
  }
});

adminManualRouter.put("/manual", authenticate, requireAdmin, async (req, res) => {
  try {
    const payload = sanitizePayload(req.body ?? {});
    if (!payload) {
      res.status(400).json({ error: "documents array is required" });
      return;
    }
    await ensureManualRow();
    const updated = await prisma.manualPage.update({
      where: { id: MANUAL_ID },
      data: {
        payload,
        updatedBy: req.user.id,
      },
    });
    await logEvent({
      event: "manual.updated",
      actorId: req.user.id,
      targetType: "manual",
      targetId: MANUAL_ID,
      meta: {
        documentCount: payload.documents.length,
        email: req.user.email,
      },
    });
    res.json({
      ok: true,
      id: updated.id,
      documents: payload.documents,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("[manual] put failed", error);
    res.status(500).json({ error: "Failed to save manual" });
  }
});

/** ดาวน์โหลด/ดู PDF ของ Manual — ต้องล็อกอิน (admin|support) ไม่เปิดสาธารณะ */
adminManualRouter.get("/manual/file/:filename", authenticate, requireRole("support", "admin"), async (req, res) => {
  try {
    const filename = String(req.params.filename || "");
    if (!/^[A-Za-z0-9._-]+\.pdf$/i.test(filename)) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }
    const filePath = path.join(manualUploadsDir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error("[manual] file serve failed", error);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

adminManualRouter.post(
  "/manual/upload",
  authenticate,
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "file is required" });
        return;
      }
      const mime = String(file.mimetype || "").toLowerCase();
      const original = String(file.originalname || "").toLowerCase();
      const isPdf = mime === "application/pdf" || original.endsWith(".pdf");
      if (!isPdf) {
        res.status(400).json({ error: "อนุญาตเฉพาะไฟล์ PDF" });
        return;
      }
      fs.mkdirSync(manualUploadsDir, { recursive: true });
      const fileName = `${crypto.randomUUID()}.pdf`;
      const filePath = path.join(manualUploadsDir, fileName);
      fs.writeFileSync(filePath, file.buffer);
      const url = `/uploads/manual/${fileName}`;
      await logEvent({
        event: "manual.pdf.uploaded",
        actorId: req.user.id,
        targetType: "manual",
        targetId: MANUAL_ID,
        meta: { fileName, originalName: file.originalname, size: file.size },
      });
      res.json({ ok: true, url, fileName });
    } catch (error) {
      console.error("[manual] upload failed", error);
      res.status(500).json({ error: "Failed to upload PDF" });
    }
  },
);
