import express from "express";
import { prisma } from "../db.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { logEvent } from "../lib/logging.js";
import { getLastActivityByUserIds } from "../lib/lastUserActivity.js";

const DEFAULT_BOT_NAME = "BingSu Assistant";
const DEFAULT_BOT_PROMPT = [
  "คุณคือ BingSu Assistant — ผู้ช่วย AI อัจฉริยะที่เป็นมิตรและฉลาด",
  "",
  "สิ่งที่ทำได้:",
  "- ทักทาย สนทนาทั่วไป และให้คำแนะนำได้ตามปกติ",
  "- วิเคราะห์และตอบจากข้อมูลในเอกสาร (Knowledge) ที่ Support อัปโหลดไว้",
  "- ตอบคำถามเกี่ยวกับระบบบิงซูบอท (วิธีใช้งาน เมนูต่างๆ การตั้งค่า)",
  "- เข้าใจได้แม้ผู้ใช้พิมพ์ผิด สะกดผิด หรือใช้ภาษาไม่เป็นทางการ",
  "",
  "แนวทาง:",
  "- ตอบเป็นภาษาเดียวกับคำถาม (ไทย/อังกฤษ) อย่างกระชับและเป็นมิตร",
  "- เมื่อมีข้อมูลในเอกสาร ให้อิงข้อมูลนั้นเป็นหลัก",
  "- จำบทสนทนาก่อนหน้าและตอบต่อเนื่องได้",
  "- ถ้าผู้ใช้ขอเปลี่ยนรูปแบบการพูด (เช่น คุยแบบเพื่อน ใช้ค่ะ) ให้ปรับตาม",
].join("\n");

/** ผูก document เข้า bot (upsert ป้องกัน duplicate) */
async function linkDocumentToBot(botId, documentId) {
  await prisma.botDocument.upsert({
    where: { botId_documentId: { botId, documentId } },
    update: {},
    create: { botId, documentId },
  }).catch(() => null);
}

/** สร้างบอทเริ่มต้นให้ user ถ้ายังไม่มี (ข้ามบอทช่วยสอน)
 *  และผูก (1) help doc + (2) support docs ที่มีอยู่แล้วให้บอท
 */
export async function ensureUserDefaultBot(userId) {
  // ใช้ default bot กลางเพียงตัวเดียวทั้งระบบ (ไม่สร้างซ้ำต่อ user)
  let bot = await prisma.bot.findFirst({
    where: { name: DEFAULT_BOT_NAME },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!bot) {
    const systemOwner =
      await prisma.user.findFirst({
        where: { role: { in: ["support", "admin", "admin_metrics"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
    bot = await prisma.bot.create({
      data: {
        name: DEFAULT_BOT_NAME,
        prompt: DEFAULT_BOT_PROMPT,
        description: "ระบบผู้ช่วยอัจฉริยะสำหรับตอบคำถามและวิเคราะห์ข้อมูลจากฐานความรู้อย่างเป็นระบบ โดยมุ่งเน้นความถูกต้อง รวดเร็ว และความน่าเชื่อถือของข้อมูล",
        model: null,
        avatarUrl: "emoji:🤖",
        ownerId: systemOwner?.id || userId,
        enabled: true,
      },
      select: { id: true },
    });
  }

  // ผูก help document ("คู่มือการใช้งาน") เป็น fallback เสมอ
  const helpDoc = await prisma.document.findFirst({
    where: { displayName: "คู่มือการใช้งาน" },
    select: { id: true },
  });
  if (helpDoc) await linkDocumentToBot(bot.id, helpDoc.id);

  // ผูก support/admin documents ที่มีอยู่แล้ว (เผื่อ support อัปก่อนที่ user จะสร้างบอท)
  const staffDocs = await prisma.document.findMany({
    where: {
      displayName: { not: "คู่มือการใช้งาน" },
      owner: { role: { in: ["support", "admin"] } },
    },
    select: { id: true },
  });
  for (const doc of staffDocs) {
    await linkDocumentToBot(bot.id, doc.id);
    // share กับ user ด้วยถ้ายังไม่ได้ share
    await prisma.documentShare.upsert({
      where: { documentId_userId: { documentId: doc.id, userId } },
      update: {},
      create: { documentId: doc.id, userId, role: "viewer" },
    }).catch(() => null);
  }

  // เก็บไว้เพียง default bot กลางตัวเดียว ลดการซ้ำในหน้า Support
  await prisma.bot.deleteMany({
    where: {
      name: DEFAULT_BOT_NAME,
      id: { not: bot.id },
    },
  }).catch(() => null);

  return bot;
}

export const supportRouter = express.Router();

async function hasUserExpiresAtColumn() {
  try {
    const rows = await prisma.$queryRaw`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'User'
        AND column_name = 'expiresAt'
      LIMIT 1;
    `;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

supportRouter.get("/pending-users", authenticate, requireRole("support", "admin", "admin_metrics"), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { approvalStatus: "pending", role: "user" },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

/** รายชื่อลูกค้าที่ลงทะเบียน (role user ทั้งรออนุมัติและอนุมัติแล้ว) — ให้ Support ดูอีเมลใน Overview */
supportRouter.get("/customers", authenticate, requireRole("support", "admin", "admin_metrics"), async (_req, res) => {
  const hasExpiry = await hasUserExpiresAtColumn();

  if (hasExpiry) {
    // Ensure legacy/old users (approved) have an expiry date (30 days after createdAt as fallback).
    // Only for role=user. Support/Admin should not have expiresAt.
    await prisma.$executeRaw`
      UPDATE "User"
      SET "expiresAt" = ("createdAt" + INTERVAL '30 days')
      WHERE
        "role" = 'user'
        AND "approvalStatus" = 'approved'
        AND "expiresAt" IS NULL;
    `;
  }

  const users = await prisma.user.findMany({
    where: { role: "user" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      approvalStatus: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      ...(hasExpiry ? { expiresAt: true } : {}),
    },
  });
  const activityMap = await getLastActivityByUserIds(users.map((u) => u.id));
  res.json(
    users.map((user) => {
      const fromActivity = activityMap.get(user.id);
      const times = [fromActivity, user.updatedAt]
        .filter(Boolean)
        .map((d) => new Date(d).getTime())
        .filter((t) => Number.isFinite(t));
      const lastActivityAt = times.length ? new Date(Math.max(...times)).toISOString() : null;
      const expiryFallback =
        hasExpiry && user.createdAt
          ? new Date(new Date(user.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
          : null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        isActive: user.isActive,
        createdAt: user.createdAt,
        // If DB is missing expiresAt, fallback to createdAt + 30 days (UI requested).
        expiresAt: hasExpiry ? (user.expiresAt || expiryFallback) : null,
        lastActivityAt,
      };
    }),
  );
});

supportRouter.patch("/pending-users/:id", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
  const { approvalStatus } = req.body ?? {};
  if (!approvalStatus || !["approved", "rejected"].includes(approvalStatus)) {
    res.status(400).json({ error: "approvalStatus must be approved or rejected" });
    return;
  }
  const hasExpiry = await hasUserExpiresAtColumn();
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, email: true, name: true, role: true, approvalStatus: true, ...(hasExpiry ? { expiresAt: true } : {}) },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const shouldSetExpiry =
    hasExpiry && approvalStatus === "approved" && target.role === "user" && !target.expiresAt;

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      approvalStatus,
      isActive: approvalStatus === "approved" ? true : undefined,
      ...(shouldSetExpiry ? { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } : {}),
    },
  });

  // สร้างบอทเริ่มต้นให้ user อัตโนมัติเมื่ออนุมัติ
  if (approvalStatus === "approved" && updated.role === "user") {
    ensureUserDefaultBot(updated.id).catch((e) =>
      console.error("[support] ensureUserDefaultBot failed:", e?.message)
    );
  }

  await logEvent({
    event: "user.approval.updated",
    actorId: req.user.id,
    targetType: "user",
    targetId: updated.id,
    meta: {
      email: updated.email,
      name: updated.name,
      approvalStatus: updated.approvalStatus,
      expiresAt: hasExpiry && updated.expiresAt ? updated.expiresAt.toISOString() : null,
    },
  });
  res.json(updated);
});

supportRouter.post(
  "/users/:id/renew",
  authenticate,
  requireRole("support", "admin", "admin_metrics"),
  async (req, res) => {
    const hasExpiry = await hasUserExpiresAtColumn();
    if (!hasExpiry) {
      res.status(500).json({ error: "expiresAt column not available yet - run prisma migrate deploy" });
      return;
    }
    const extendDaysRaw = Number(req.body?.extendDays);
    const extendDays = Number.isFinite(extendDaysRaw) ? Math.max(1, Math.min(3650, Math.floor(extendDaysRaw))) : 30;

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, name: true, role: true, expiresAt: true, approvalStatus: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.role !== "user") {
      res.status(400).json({ error: "Only role=user can be renewed" });
      return;
    }
    if (user.approvalStatus !== "approved") {
      res.status(400).json({ error: "Only approved users can be renewed" });
      return;
    }

    const now = new Date();
    const base = user.expiresAt && user.expiresAt.getTime() > now.getTime() ? user.expiresAt : now;
    const next = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);

    const updated = await prisma.user.update({ where: { id: user.id }, data: { expiresAt: next } });

    await logEvent({
      event: "user.expiry.renewed",
      actorId: req.user.id,
      targetType: "user",
      targetId: updated.id,
      meta: {
        email: updated.email,
        name: updated.name,
        extendDays,
        from: user.expiresAt ? user.expiresAt.toISOString() : null,
        to: updated.expiresAt ? updated.expiresAt.toISOString() : null,
      },
    });

    res.json(updated);
  },
);

const parseYmd = (s) => {
  const t = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split("-").map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
};

supportRouter.get("/logs", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
  const takeRaw = Number(req.query?.take ?? req.query?.limit);
  const take = Number.isFinite(takeRaw) ? Math.max(1, Math.min(500, Math.floor(takeRaw))) : 200;

  const messageFilter = req.query?.message ? String(req.query.message).trim() : "";
  const eventExact = req.query?.event ? String(req.query.event).trim() : "";
  const q = req.query?.q ? String(req.query.q).trim() : "";
  const fromStr = req.query?.from ? String(req.query.from).trim() : "";
  const toStr = req.query?.to ? String(req.query.to).trim() : "";

  const and = [];

  if (eventExact) {
    and.push({ message: eventExact });
  }
  if (messageFilter) {
    and.push({ message: { contains: messageFilter, mode: "insensitive" } });
  }
  if (q) {
    and.push({
      OR: [
        { message: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const fromP = parseYmd(fromStr);
  if (fromP) {
    and.push({
      createdAt: { gte: new Date(Date.UTC(fromP.y, fromP.m - 1, fromP.d, 0, 0, 0, 0)) },
    });
  }
  const toP = parseYmd(toStr);
  if (toP) {
    and.push({
      createdAt: { lte: new Date(Date.UTC(toP.y, toP.m - 1, toP.d, 23, 59, 59, 999)) },
    });
  }

  const where = and.length ? { AND: and } : {};

  const logs = await prisma.systemLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, email: true, name: true, role: true } },
    },
  });
  res.json(logs);
});

supportRouter.get("/report", authenticate, requireRole("support", "admin", "admin_metrics"), async (_req, res) => {
  const [
    usersCount,
    documentsCount,
    conversationsCount,
    messagesCount,
    uploadBatchesCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.document.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.uploadBatch.count(),
  ]);

  res.json({
    usersCount,
    documentsCount,
    conversationsCount,
    messagesCount,
    uploadBatchesCount,
    timestamp: new Date().toISOString(),
  });
});
