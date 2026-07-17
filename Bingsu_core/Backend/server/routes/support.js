import express from "express";
import { prisma } from "../db.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { logEvent } from "../lib/logging.js";
import { getLastActivityByUserIds } from "../lib/lastUserActivity.js";
import { getRequestContext } from "../lib/requestContext.js";
import { maskLogForExport } from "../lib/privacy.js";
import { invalidateRateCache } from "../services/ntCorpPricingDb.js";

const DEFAULT_BOT_NAME = "Enterprise AI Chatbot Assistant";
const DEFAULT_BOT_PROMPT = [
  "คุณคือ Enterprise AI Chatbot Assistant — ผู้ช่วย AI อัจฉริยะที่เป็นมิตรและฉลาด",
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

// GET /api/support/feedback — คิวรีวิวคำตอบที่ผู้ใช้ให้ feedback (ค่าเริ่มต้น = 👎 down) พร้อมคำถาม + จำนวน context เพื่อหา knowledge ที่ขาด
supportRouter.get(
  "/feedback",
  authenticate,
  requireRole("support", "admin", "admin_metrics"),
  async (req, res) => {
    try {
      const rating = ["up", "down"].includes(String(req.query.rating || "").toLowerCase())
        ? String(req.query.rating).toLowerCase()
        : "down";
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const feedbacks = await prisma.messageFeedback.findMany({
        where: { rating },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, name: true, email: true } },
          message: {
            select: {
              id: true,
              content: true,
              references: true,
              groundingChunks: true,
              createdAt: true,
              conversationId: true,
              conversation: { select: { id: true, title: true } },
            },
          },
        },
      });

      const items = await Promise.all(
        feedbacks.map(async (fb) => {
          const msg = fb.message;
          let question = "";
          if (msg?.conversationId && msg?.createdAt) {
            const prevUser = await prisma.message.findFirst({
              where: {
                conversationId: msg.conversationId,
                role: "user",
                createdAt: { lt: msg.createdAt },
              },
              orderBy: { createdAt: "desc" },
              select: { content: true },
            });
            question = prevUser?.content || "";
          }
          const refs = Array.isArray(msg?.references) ? msg.references : [];
          const chunks = Array.isArray(msg?.groundingChunks) ? msg.groundingChunks : [];
          return {
            feedbackId: fb.id,
            rating: fb.rating,
            comment: fb.comment || "",
            createdAt: fb.createdAt,
            question,
            answer: msg?.content || "",
            messageId: msg?.id || null,
            conversationId: msg?.conversationId || null,
            conversationTitle: msg?.conversation?.title || "",
            referencesCount: refs.length,
            groundingChunksCount: chunks.length,
            // true = มี context แต่ยังโดน 👎 (retrieval/คำตอบพลาด); false = ไม่มี context (knowledge ขาด)
            hadContext: refs.length > 0 || chunks.length > 0,
            feedbackBy: fb.user ? { id: fb.user.id, name: fb.user.name, email: fb.user.email } : null,
          };
        }),
      );

      const total = await prisma.messageFeedback.count({ where: { rating } });
      res.json({ items, total, limit, offset, rating });
    } catch (error) {
      console.error("get support feedback failed", error);
      res.status(500).json({ error: "Failed to load feedback" });
    }
  },
);

// GET /api/support/quality-metrics — เมตริกคุณภาพ: feedback ratio, อัตราตอบ "ไม่มีข้อมูล", คำถามที่ตอบไม่ได้บ่อย
supportRouter.get(
  "/quality-metrics",
  authenticate,
  requireRole("support", "admin", "admin_metrics"),
  async (req, res) => {
    try {
      const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
      const since = new Date(Date.now() - days * 86400000);
      // ข้อความที่บ่งบอกว่าบอทตอบ "ไม่มีข้อมูล/ไม่พบ" = knowledge อาจขาด
      const NO_DATA_MARKERS = ["ไม่มีข้อมูล", "ยังไม่พบข้อมูลที่ตรง", "ไม่มีอยู่ในฐานข้อมูล"];
      const noDataWhere = {
        role: "model",
        createdAt: { gte: since },
        OR: NO_DATA_MARKERS.map((m) => ({ content: { contains: m } })),
      };

      const [up, down, totalAnswers, noDataTotal, noDataMsgs] = await Promise.all([
        prisma.messageFeedback.count({ where: { rating: "up", createdAt: { gte: since } } }),
        prisma.messageFeedback.count({ where: { rating: "down", createdAt: { gte: since } } }),
        prisma.message.count({ where: { role: "model", createdAt: { gte: since } } }),
        prisma.message.count({ where: noDataWhere }),
        prisma.message.findMany({
          where: noDataWhere,
          select: { conversationId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 150,
        }),
      ]);

      // จัดกลุ่มคำถามที่นำไปสู่คำตอบ "ไม่มีข้อมูล" — ชี้ว่าควรเติม knowledge เรื่องไหน
      const questionCounts = new Map();
      await Promise.all(
        noDataMsgs.map(async (m) => {
          if (!m.conversationId || !m.createdAt) return;
          const prev = await prisma.message.findFirst({
            where: { conversationId: m.conversationId, role: "user", createdAt: { lt: m.createdAt } },
            orderBy: { createdAt: "desc" },
            select: { content: true },
          });
          const q = String(prev?.content || "").trim().slice(0, 200);
          if (!q) return;
          questionCounts.set(q, (questionCounts.get(q) || 0) + 1);
        }),
      );
      const topNoDataQuestions = Array.from(questionCounts.entries())
        .map(([question, count]) => ({ question, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      const feedbackTotal = up + down;
      res.json({
        days,
        feedback: {
          up,
          down,
          total: feedbackTotal,
          downRate: feedbackTotal ? down / feedbackTotal : 0,
        },
        answers: {
          total: totalAnswers,
          noData: noDataTotal,
          noDataRate: totalAnswers ? noDataTotal / totalAnswers : 0,
        },
        topNoDataQuestions,
      });
    } catch (error) {
      console.error("get quality-metrics failed", error);
      res.status(500).json({ error: "Failed to load quality metrics" });
    }
  },
);

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
    // Send to support approval only after user has verified email
    // and completed initial password setup.
    where: {
      approvalStatus: "pending",
      role: "user",
      emailVerifiedAt: { not: null },
      emailVerificationToken: null,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
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
    where: {
      role: "user",
      OR: [
        { approvalStatus: "approved" },
        {
          approvalStatus: "pending",
          emailVerifiedAt: { not: null },
          emailVerificationToken: null,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      ],
    },
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
  const context = getRequestContext(req);
  if (!approvalStatus || !["approved", "rejected"].includes(approvalStatus)) {
    res.status(400).json({ error: "approvalStatus must be approved or rejected" });
    return;
  }
  const hasExpiry = await hasUserExpiresAtColumn();
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      approvalStatus: true,
      emailVerifiedAt: true,
      emailVerificationToken: true,
      passwordResetToken: true,
      passwordResetExpiresAt: true,
      ...(hasExpiry ? { expiresAt: true } : {}),
    },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const isApprovalReady =
    target.role === "user" &&
    target.approvalStatus === "pending" &&
    !!target.emailVerifiedAt &&
    target.emailVerificationToken === null &&
    target.passwordResetToken === null &&
    target.passwordResetExpiresAt === null;

  if (approvalStatus === "approved" && !isApprovalReady) {
    res.status(400).json({
      error: "User is not ready for approval yet (must verify email and complete initial password setup first)",
    });
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
      ...context,
    },
  });
  res.json(updated);
});

supportRouter.post(
  "/users/:id/renew",
  authenticate,
  requireRole("support", "admin", "admin_metrics"),
  async (req, res) => {
    const context = getRequestContext(req);
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
        ...context,
      },
    });

    res.json(updated);
  },
);

supportRouter.delete(
  "/users/:id",
  authenticate,
  requireRole("support", "admin", "admin_metrics"),
  async (req, res) => {
    const context = getRequestContext(req);
    const userId = String(req.params.id || "").trim();
    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }
    if (String(req.user?.id || "") === userId) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, approvalStatus: true },
    });
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (target.role !== "user") {
      res.status(403).json({ error: "Only role=user can be deleted from support panel" });
      return;
    }
    const actorRole = String(req.user?.role || "");
    const isAdmin = actorRole === "admin";
    if (!isAdmin && target.approvalStatus !== "pending") {
      res.status(403).json({ error: "Support can delete only pending applicants" });
      return;
    }

    await logEvent({
      event: "support.user.deleted",
      actorId: req.user.id,
      targetType: "user",
      targetId: target.id,
      meta: {
        email: target.email,
        name: target.name,
        ...context,
      },
    });
    await prisma.user.delete({ where: { id: userId } });
    res.json({ ok: true });
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
  const category = req.query?.category ? String(req.query.category).trim().toLowerCase() : "";
  const maskParam = String(req.query?.mask ?? "true").toLowerCase();
  const requestedUnmasked = ["0", "false", "no"].includes(maskParam);
  const canViewRawLogs = ["admin", "admin_metrics"].includes(String(req.user?.role || ""));
  const shouldMask = requestedUnmasked ? !canViewRawLogs : true;

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
  if (category && ["security", "application"].includes(category)) {
    and.push({ meta: { path: ["category"], equals: category } });
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
  res.json(shouldMask ? logs.map(maskLogForExport) : logs);
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

// ===== คำพ้องความหมาย (Synonyms) — จัดการโดย support/admin เพื่อช่วย RAG เชื่อมภาษาพูด ↔ คำทางการ =====
const cleanSynonymList = (value) => {
  const arr = Array.isArray(value) ? value : String(value ?? "").split(/[,\n]/);
  return Array.from(new Set(arr.map((s) => String(s).trim()).filter(Boolean)));
};

supportRouter.get("/synonyms", authenticate, requireRole("admin"), async (_req, res) => {
  const items = await prisma.synonym.findMany({ orderBy: { updatedAt: "desc" } });
  res.json(items);
});

supportRouter.post("/synonyms", authenticate, requireRole("admin"), async (req, res) => {
  const term = String(req.body?.term ?? "").trim();
  const synonyms = cleanSynonymList(req.body?.synonyms);
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 300) : null;
  const enabled = req.body?.enabled === undefined ? true : Boolean(req.body.enabled);
  if (!term) { res.status(400).json({ error: "term is required" }); return; }
  if (synonyms.length === 0) { res.status(400).json({ error: "synonyms must not be empty" }); return; }
  const item = await prisma.synonym.create({ data: { term, synonyms, note, enabled } });
  await logEvent({ event: "synonym.created", actorId: req.user?.id, targetType: "synonym", targetId: item.id, meta: { term } }).catch(() => {});
  res.status(201).json(item);
});

supportRouter.patch("/synonyms/:id", authenticate, requireRole("admin"), async (req, res) => {
  const data = {};
  if (req.body?.term !== undefined) {
    const t = String(req.body.term).trim();
    if (!t) { res.status(400).json({ error: "term must not be empty" }); return; }
    data.term = t;
  }
  if (req.body?.synonyms !== undefined) {
    const s = cleanSynonymList(req.body.synonyms);
    if (s.length === 0) { res.status(400).json({ error: "synonyms must not be empty" }); return; }
    data.synonyms = s;
  }
  if (req.body?.note !== undefined) data.note = req.body.note ? String(req.body.note).trim().slice(0, 300) : null;
  if (req.body?.enabled !== undefined) data.enabled = Boolean(req.body.enabled);
  const item = await prisma.synonym.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!item) { res.status(404).json({ error: "not found" }); return; }
  const onlyEnabledChanged = Object.keys(data).length === 1 && data.enabled !== undefined;
  const patchEvent = onlyEnabledChanged ? (data.enabled ? "synonym.enabled" : "synonym.disabled") : "synonym.updated";
  await logEvent({ event: patchEvent, actorId: req.user?.id, targetType: "synonym", targetId: item.id, meta: { term: item.term, enabled: item.enabled } }).catch(() => {});
  res.json(item);
});

supportRouter.delete("/synonyms/:id", authenticate, requireRole("admin"), async (req, res) => {
  const removed = await prisma.synonym.delete({ where: { id: req.params.id } }).catch(() => null);
  if (removed) {
    await logEvent({ event: "synonym.deleted", actorId: req.user?.id, targetType: "synonym", targetId: req.params.id, meta: { term: removed.term } }).catch(() => {});
  }
  res.json({ ok: true });
});

// ===== อัตราค่าบริการ (ServiceRate) — admin แก้เพื่อให้เครื่องคำนวณราคาใช้ค่าล่าสุด =====
supportRouter.get("/service-rates", authenticate, requireRole("admin"), async (_req, res) => {
  const items = await prisma.serviceRate.findMany({
    orderBy: [{ service: "asc" }, { kind: "asc" }, { speed: "asc" }],
  });
  res.json(items);
});

supportRouter.post("/service-rates", authenticate, requireRole("admin"), async (req, res) => {
  const service = String(req.body?.service) === "lite" ? "lite" : "corp";
  const kind = String(req.body?.kind) === "local" ? "local" : "intl";
  const speed = Math.round(Number(req.body?.speed));
  const rate = Math.round(Number(req.body?.rate));
  if (!Number.isFinite(speed) || speed <= 0) { res.status(400).json({ error: "speed invalid" }); return; }
  if (!Number.isFinite(rate) || rate < 0) { res.status(400).json({ error: "rate invalid" }); return; }
  const item = await prisma.serviceRate.upsert({
    where: { service_kind_speed: { service, kind, speed } },
    update: { rate },
    create: { service, kind, speed, rate },
  });
  invalidateRateCache();
  await logEvent({ event: "service_rate.updated", actorId: req.user?.id, targetType: "service_rate", targetId: item.id, meta: { service, kind, speed, rate } }).catch(() => {});
  res.status(201).json(item);
});

supportRouter.patch("/service-rates/:id", authenticate, requireRole("admin"), async (req, res) => {
  const rate = Math.round(Number(req.body?.rate));
  if (!Number.isFinite(rate) || rate < 0) { res.status(400).json({ error: "rate invalid" }); return; }
  const item = await prisma.serviceRate.update({ where: { id: req.params.id }, data: { rate } }).catch(() => null);
  if (!item) { res.status(404).json({ error: "not found" }); return; }
  invalidateRateCache();
  await logEvent({ event: "service_rate.updated", actorId: req.user?.id, targetType: "service_rate", targetId: item.id, meta: { service: item.service, kind: item.kind, speed: item.speed, rate: item.rate } }).catch(() => {});
  res.json(item);
});

supportRouter.delete("/service-rates/:id", authenticate, requireRole("admin"), async (req, res) => {
  const removed = await prisma.serviceRate.delete({ where: { id: req.params.id } }).catch(() => null);
  invalidateRateCache();
  if (removed) {
    await logEvent({ event: "service_rate.deleted", actorId: req.user?.id, targetType: "service_rate", targetId: req.params.id, meta: { service: removed.service, kind: removed.kind, speed: removed.speed } }).catch(() => {});
  }
  res.json({ ok: true });
});
