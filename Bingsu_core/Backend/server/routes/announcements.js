/**
 * ประกาศจาก admin ถึงผู้ใช้
 * - announcementsRouter: ฝั่งผู้ใช้ ดึงประกาศที่เปิดใช้อยู่ (GET /active) — mount ที่ /api/announcements
 * - adminAnnouncementsRouter: ฝั่ง support/admin จัดการประกาศ (list/create/update/delete) — mount ใต้ /api/admin
 */
import express from "express";
import { prisma } from "../db.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { logEvent } from "../lib/logging.js";

export const announcementsRouter = express.Router();
export const adminAnnouncementsRouter = express.Router();

const MAINTENANCE_ID = "default";
const MAINTENANCE_CONTACT_EMAIL = "aisupport@ntplc.co.th";
const MAINTENANCE_DEFAULT_MESSAGE = "เว็บมีปัญหา กำลังแก้ไข กรุณาลองใหม่อีกครั้งในภายหลัง";

export const toMaintenancePublic = (row) => ({
  enabled: Boolean(row?.enabled),
  message: String(row?.message || MAINTENANCE_DEFAULT_MESSAGE),
  contactEmail: MAINTENANCE_CONTACT_EMAIL,
  updatedAt: row?.updatedAt || null,
});

export async function getOrCreateMaintenance() {
  return prisma.maintenanceMode.upsert({
    where: { id: MAINTENANCE_ID },
    create: {
      id: MAINTENANCE_ID,
      enabled: false,
      message: MAINTENANCE_DEFAULT_MESSAGE,
      contactEmail: MAINTENANCE_CONTACT_EMAIL,
    },
    update: {},
  });
}

/** สาธารณะ — หน้า User ใช้ตรวจว่าต้องแสดง Maintenance page หรือไม่ */
announcementsRouter.get("/maintenance", async (_req, res) => {
  try {
    const row = await getOrCreateMaintenance();
    res.json(toMaintenancePublic(row));
  } catch (err) {
    console.error("[announcements/maintenance GET]", err?.message || err);
    res.status(500).json({ error: "โหลดสถานะปิดปรับปรุงไม่สำเร็จ" });
  }
});

announcementsRouter.get("/active", authenticate, async (_req, res) => {
  const items = await prisma.announcement.findMany({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: { id: true, message: true, level: true, updatedAt: true },
  });
  res.json({ announcements: items });
});

adminAnnouncementsRouter.get("/maintenance", authenticate, requireRole("support", "admin"), async (_req, res) => {
  try {
    const row = await getOrCreateMaintenance();
    res.json(toMaintenancePublic(row));
  } catch (err) {
    console.error("[admin/maintenance GET]", err?.message || err);
    res.status(500).json({ error: "โหลดสถานะปิดปรับปรุงไม่สำเร็จ" });
  }
});

adminAnnouncementsRouter.patch("/maintenance", authenticate, requireRole("support", "admin"), async (req, res) => {
  try {
    const existing = await getOrCreateMaintenance();
    const hasEnabled = typeof req.body?.enabled === "boolean";
    const hasMessage = typeof req.body?.message === "string";
    if (!hasEnabled && !hasMessage) {
      res.json(toMaintenancePublic(existing));
      return;
    }
    const data = { contactEmail: MAINTENANCE_CONTACT_EMAIL, updatedBy: req.user?.id || null };
    if (hasEnabled) data.enabled = req.body.enabled;
    if (hasMessage) {
      const message = req.body.message.trim().slice(0, 500);
      data.message = message || MAINTENANCE_DEFAULT_MESSAGE;
    }
    const updated = await prisma.maintenanceMode.update({
      where: { id: existing.id },
      data,
    });

    const enabledChanged = typeof data.enabled === "boolean" && data.enabled !== existing.enabled;
    const event = enabledChanged
      ? (updated.enabled ? "admin.maintenance.enabled" : "admin.maintenance.disabled")
      : "admin.maintenance.updated";
    await logEvent({
      event,
      actorId: req.user.id,
      targetType: "maintenance",
      targetId: updated.id,
      meta: {
        enabled: updated.enabled,
        message: String(updated.message || "").slice(0, 100),
        contactEmail: MAINTENANCE_CONTACT_EMAIL,
        changed: Object.keys(data).filter((k) => k !== "updatedBy" && k !== "contactEmail"),
      },
    });
    res.json(toMaintenancePublic(updated));
  } catch (err) {
    console.error("[admin/maintenance PATCH]", err?.message || err);
    res.status(500).json({ error: "อัปเดตโหมดปิดปรับปรุงไม่สำเร็จ" });
  }
});

adminAnnouncementsRouter.get("/announcements", authenticate, requireRole("support", "admin"), async (_req, res) => {
  const items = await prisma.announcement.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  res.json({ announcements: items });
});

adminAnnouncementsRouter.post("/announcements", authenticate, requireRole("support", "admin"), async (req, res) => {
  const message = String(req.body?.message || "").trim().slice(0, 500);
  const level = req.body?.level === "warning" ? "warning" : "info";
  if (!message) {
    res.status(400).json({ error: "กรุณาระบุข้อความประกาศ" });
    return;
  }
  const created = await prisma.announcement.create({
    data: { message, level, active: req.body?.active !== false },
  });
  await logEvent({
    event: "admin.announcement.created",
    actorId: req.user.id,
    targetType: "announcement",
    targetId: created.id,
    meta: { message: message.slice(0, 100) },
  });
  res.status(201).json(created);
});

adminAnnouncementsRouter.patch("/announcements/:id", authenticate, requireRole("support", "admin"), async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "ไม่พบประกาศนี้" });
    return;
  }
  const data = {};
  if (typeof req.body?.message === "string" && req.body.message.trim()) {
    data.message = req.body.message.trim().slice(0, 500);
  }
  if (req.body?.level === "info" || req.body?.level === "warning") data.level = req.body.level;
  if (typeof req.body?.active === "boolean") data.active = req.body.active;
  if (Object.keys(data).length === 0) {
    res.json(existing);
    return;
  }
  const updated = await prisma.announcement.update({ where: { id: existing.id }, data });
  const onlyActiveChanged = Object.keys(data).length === 1 && data.active !== undefined;
  const event = onlyActiveChanged
    ? (data.active ? "admin.announcement.enabled" : "admin.announcement.disabled")
    : "admin.announcement.updated";
  await logEvent({
    event,
    actorId: req.user.id,
    targetType: "announcement",
    targetId: updated.id,
    meta: {
      message: String(updated.message || "").slice(0, 100),
      level: updated.level,
      active: updated.active,
      changed: Object.keys(data),
    },
  });
  res.json(updated);
});

adminAnnouncementsRouter.delete("/announcements/:id", authenticate, requireRole("support", "admin"), async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "ไม่พบประกาศนี้" });
    return;
  }
  await prisma.announcement.delete({ where: { id: existing.id } });
  await logEvent({
    event: "admin.announcement.deleted",
    actorId: req.user.id,
    targetType: "announcement",
    targetId: existing.id,
    meta: {
      message: String(existing.message || "").slice(0, 100),
      level: existing.level,
    },
  });
  res.json({ ok: true });
});
