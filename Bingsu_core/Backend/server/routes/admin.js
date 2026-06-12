import express from "express";
import { prisma } from "../db.js";
import { authenticate, requireAdmin, requireAdminMetrics, requireRole, sanitizeUser } from "../lib/auth.js";
import { getRequestContext } from "../lib/requestContext.js";
import { logEvent } from "../lib/logging.js";
import { deleteBotWithCleanup } from "../services/uploadQueue.js";
import { deleteDocumentVectors } from "../services/vectorDb.js";
import { getLastActivityByUserIds } from "../lib/lastUserActivity.js";
import { invalidateUserCaches } from "../lib/cache.js";
import { ensureSourceFileBlocks } from "../services/text.js";
import { indexDocumentChunks } from "../services/vectorDb.js";
import { FREE_DAILY_TOKEN_LIMIT } from "../config.js";
import { getDateKey } from "../services/usage.js";

export const adminRouter = express.Router();

const HELP_DOC_DISPLAY_NAME = "คู่มือการใช้งาน";
const HELP_BOT_NAME = "บอทช่วยสอน";

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

adminRouter.get("/metrics", authenticate, requireAdminMetrics, async (_req, res) => {
  const [
    usersCount,
    documentsCount,
    conversationsCount,
    messagesCount,
    uploadBatchesCount,
    pendingUsersCount,
    botsCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.document.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.uploadBatch.count(),
    prisma.user.count({ where: { approvalStatus: "pending", role: "user" } }),
    prisma.bot.count(),
  ]);

  res.json({
    usersCount,
    documentsCount,
    conversationsCount,
    messagesCount,
    uploadBatchesCount,
    pendingUsersCount,
    botsCount,
    timestamp: new Date().toISOString(),
  });
});

adminRouter.get("/activity", authenticate, requireAdminMetrics, async (req, res) => {
  const daysRaw = Number(req.query?.days);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, Math.floor(daysRaw))) : 14;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const platformRows = await prisma.message.groupBy({
    by: ["platform"],
    where: { role: "user", createdAt: { gte: from, lte: to } },
    _count: { _all: true },
  });
  const platformCounts = {};
  platformRows.forEach((row) => {
    const key = String(row.platform || "website").toLowerCase();
    platformCounts[key] = (platformCounts[key] || 0) + row._count._all;
  });

  const seriesRows = await prisma.$queryRaw`
    SELECT
      date_trunc('day', "createdAt")::date AS "day",
      "role" AS "role",
      COUNT(*)::int AS "count"
    FROM "Message"
    WHERE
      "createdAt" >= ${from}
      AND "createdAt" <= ${to}
      AND "role" IN ('user', 'model')
    GROUP BY 1, 2
    ORDER BY 1 ASC;
  `;

  const series = (Array.isArray(seriesRows) ? seriesRows : []).map((row) => ({
    day: typeof row.day === "string" ? row.day : new Date(row.day).toISOString().slice(0, 10),
    role: String(row.role || "user"),
    count: Number(row.count || 0),
  }));

  res.json({
    range: { from: from.toISOString(), to: to.toISOString(), days },
    platformCounts,
    series,
  });
});

const BOT_SUBCATEGORIES = [
  { key: "BOT_CREATE", label: "ถามเรื่องการสร้าง Bot" },
  { key: "BOT_KNOWLEDGE", label: "ถามเรื่อง Knowledge" },
  { key: "BOT_USAGE", label: "ถามเรื่องวิธีใช้งานระบบ" },
  { key: "BOT_OTHER", label: "คำถามอื่นๆเกี่ยวกับระบบ" },
];

const FAQ_CATEGORIES = [
  { key: "USAGE", label: "คำถามเกี่ยวกับการใช้งาน" },
  { key: "PAYMENT", label: "คำถามเกี่ยวกับการชำระเงิน" },
  { key: "ACCOUNT", label: "คำถามเกี่ยวกับบัญชี" },
  { key: "TECH", label: "คำถามเกี่ยวกับเทคนิค" },
  { key: "OTHER_SYSTEM", label: "คำถามอื่นๆเกี่ยวกับระบบ" },
  { key: "OTHER_GENERAL", label: "คำถามอื่นๆทั่วไป" },
];

const classifyHelpBotMainQuestion = (rawText) => {
  const text = String(rawText ?? "").trim();
  if (!text) return "OTHER";

  // Heuristic จากคีย์เวิร์ดภาษาไทย/อังกฤษ (จัดหมวดจากข้อความที่ผู้ใช้ถามถึงบอทช่วยสอน)
  // 1) ถ้าเกี่ยวกับบอท/knowledge ให้เข้ากลุ่ม BOT ก่อน แล้วค่อยแยกย่อย
  if (/(บอท|knowledge|คู่มือ|สร้างบอท|create bot|prompt|ชุดความรู้)/i.test(text)) return "BOT";

  // 2) อย่างอื่นค่อยแยกตามประเภทหลัก
  if (/(วิธี|ทำยังไง|กด|หน้าแรก|แชท|เริ่ม|ใช้งาน|เลือก|เมนู|ส่งคำถาม)/i.test(text)) return "USAGE";
  if (/(ชำระเงิน|ชำระ|เติมเงิน|payment|บัตรเครดิต|เครดิต|โอน|จ่าย)/i.test(text)) return "PAYMENT";
  if (/(สมัคร|ล็อกอิน|login|ลงชื่อ|บัญชี|อีเมล|อีเมล์|รหัสผ่าน|password|ยืนยัน|register)/i.test(text)) return "ACCOUNT";
  if (/(error|ปัญหา|แก้|ทำไม่ได้|ล้มเหลว|timeout|token|api|ตั้งค่า|integration|เชื่อมต่อ)/i.test(text)) return "TECH";
  if (/(ระบบ|dashboard|support|admin|health|server|database|redis|qdrant|storage|docker|compose|nginx|s3)/i.test(text)) return "OTHER_SYSTEM";
  return "OTHER_GENERAL";
};

const classifyHelpBotBotSubtype = (rawText) => {
  const text = String(rawText ?? "").trim();
  if (!text) return "BOT_OTHER";

  if (/(สร้างบอท|create bot|ตั้งค่าบอท|prompt)/i.test(text)) return "BOT_CREATE";
  if (/(knowledge|ชุดความรู้|คู่มือ|select knowledge)/i.test(text)) return "BOT_KNOWLEDGE";
  if (/(วิธี|ทำยังไง|กด|หน้าแรก|แชท|เริ่ม|ใช้งาน|เมนู|ส่งคำถาม)/i.test(text)) return "BOT_USAGE";
  return "BOT_OTHER";
};

/**
 * จำนวนคำถามแยกตามหมวด (อิงจากข้อความที่ผู้ใช้ถามถึงบอท "บอทช่วยสอน")
 * ใช้สำหรับกราฟ "ประเภทคำถามที่พบบ่อย" บน Support Admin Dashboard
 */
adminRouter.get("/faq-categories", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
  const scope = String(req.query?.scope || "all").toLowerCase(); // all | user
  const daysRaw = Number(req.query?.days);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 30;
  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(100, Math.min(50000, Math.floor(limitRaw))) : 20000;

  const helpBot = await prisma.bot.findFirst({
    where: { name: HELP_BOT_NAME },
    select: { id: true },
  });

  if (!helpBot) {
    const out = FAQ_CATEGORIES.map((c) => ({ type: c.label, count: 0, percentage: 0 }));
    res.json({ categories: out, totalCount: 0, days, scope, truncated: false });
    return;
  }

  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = {
    role: "user",
    createdAt: { gte: from },
    conversation: { botId: helpBot.id },
  };

  // filter "user" = ให้นับเฉพาะผู้ใช้ที่ role = user
  if (scope === "user") {
    Object.assign(where, { user: { role: "user" } });
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { content: true },
  });

  const allCategories = [...BOT_SUBCATEGORIES, ...FAQ_CATEGORIES];
  const counts = Object.fromEntries(allCategories.map((c) => [c.key, 0]));
  for (const m of messages) {
    const main = classifyHelpBotMainQuestion(m?.content);
    if (main === "BOT") {
      const sub = classifyHelpBotBotSubtype(m?.content);
      counts[sub] = (counts[sub] || 0) + 1;
    } else {
      counts[main] = (counts[main] || 0) + 1;
    }
  }

  // ตัดรายการที่มี count=0 ออก เพื่อให้กราฟไม่รก
  const nonZero = allCategories.filter((c) => (counts[c.key] || 0) > 0);
  const totalCount = nonZero.reduce((sum, c) => sum + (counts[c.key] || 0), 0);

  const categories = nonZero
    .map((c) => {
      const count = counts[c.key] || 0;
      const percentage = totalCount > 0 ? Number(((count / totalCount) * 100).toFixed(1)) : 0;
      return { type: c.label, count, percentage };
    })
    .sort((a, b) => b.count - a.count);

  res.json({ categories, totalCount, days, scope, truncated: messages.length >= limit });
});

/**
 * Token usage รายวัน (ข้อมูลจริงจาก UsageDaily)
 * ใช้สำหรับกราฟ "การใช้ Token รายวัน" ใน Support Admin Dashboard
 */
adminRouter.get("/token-usage", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
  const scope = String(req.query?.scope || "all").toLowerCase(); // all | user (ตอนนี้ใช้รวมทั้งหมด)
  const daysRaw = Number(req.query?.days);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(30, Math.floor(daysRaw))) : 7;

  const now = new Date();
  const toKey = now.toISOString().slice(0, 10); // UTC dateKey
  const fromKey = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ดึงเฉพาะวันที่ต้องการ แล้วสรุปรวมจากทุก user (UsageDaily เก็บต่อ user)
  const rows = await prisma.usageDaily.findMany({
    where: {
      dateKey: { gte: fromKey, lte: toKey },
    },
    select: { dateKey: true, totalTokens: true, promptTokens: true, completionTokens: true },
  });

  const totalsByDateKey = {};
  for (const r of rows) {
    const key = String(r.dateKey);
    if (!totalsByDateKey[key]) totalsByDateKey[key] = { totalTokens: 0, promptTokens: 0, completionTokens: 0 };
    totalsByDateKey[key].totalTokens += Number(r.totalTokens || 0);
    totalsByDateKey[key].promptTokens += Number(r.promptTokens || 0);
    totalsByDateKey[key].completionTokens += Number(r.completionTokens || 0);
  }

  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateKey = d.toISOString().slice(0, 10);
    const label = i === 0 ? "วันนี้" : i === 1 ? "เมื่อวาน" : `${i} วันก่อน`;
    const t = totalsByDateKey[dateKey] || { totalTokens: 0, promptTokens: 0, completionTokens: 0 };
    const tokens = t.totalTokens > 0 ? t.totalTokens : t.promptTokens + t.completionTokens;
    daily.push({
      date: label,
      tokens,
    });
  }

  const rangeTotal = daily.reduce((sum, d) => sum + (Number(d.tokens) || 0), 0);

  const tToday = totalsByDateKey[toKey] || { totalTokens: 0, promptTokens: 0, completionTokens: 0 };
  const todayTokens = tToday.totalTokens > 0 ? tToday.totalTokens : tToday.promptTokens + tToday.completionTokens;
  const yesterdayKey = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const tY = totalsByDateKey[yesterdayKey] || { totalTokens: 0, promptTokens: 0, completionTokens: 0 };
  const yesterdayTokens = tY.totalTokens > 0 ? tY.totalTokens : tY.promptTokens + tY.completionTokens;
  const changePct = yesterdayTokens
    ? ((todayTokens - yesterdayTokens) / Math.max(1, yesterdayTokens)) * 100
    : 0;

  res.json({
    scope,
    days,
    rangeTotal,
    today: todayTokens,
    yesterday: yesterdayTokens,
    change: Number(changePct.toFixed(1)),
    daily,
  });
});

/**
 * สรุปจำนวนบัญชีตามบทบาท/สถานะอนุมัติ — ใช้กราฟ "บทบาทผู้ใช้" บน Support Admin Dashboard
 * ผู้ใช้งาน = role user และอนุมัติแล้วหรือถูกปฏิเสธ (ไม่รวมรออนุมัติ)
 */
adminRouter.get("/user-role-distribution", authenticate, requireRole("support", "admin", "admin_metrics"), async (_req, res) => {
  const [userActive, userPending, supportCount, adminCount] = await Promise.all([
    prisma.user.count({
      where: {
        role: "user",
        approvalStatus: { in: ["approved", "rejected"] },
      },
    }),
    prisma.user.count({
      where: { role: "user", approvalStatus: "pending" },
    }),
    prisma.user.count({ where: { role: "support" } }),
    prisma.user.count({
      where: { role: { in: ["admin", "admin_metrics"] } },
    }),
  ]);

  const buckets = [
    { role: "ผู้ใช้งาน", count: userActive },
    { role: "รอดำเนินการ", count: userPending },
    { role: "ผู้ดูแล", count: supportCount },
    { role: "แอดมิน", count: adminCount },
  ];
  const distribution = buckets.filter((b) => b.count > 0);
  const totalCount = buckets.reduce((s, b) => s + b.count, 0);

  res.json({ distribution, totalCount, buckets });
});

/**
 * โควต้าโทเค็น (วันนี้) รายผู้ใช้ — สำหรับ Support Admin dashboard/monitor
 */
adminRouter.get("/token-quota", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
  const dateKey = typeof req.query?.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateKey)
    ? req.query.dateKey
    : getDateKey();
  const takeRaw = Number(req.query?.take);
  const take = Number.isFinite(takeRaw) ? Math.max(1, Math.min(500, Math.floor(takeRaw))) : 200;
  const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";

  const whereUser = { role: "user" };
  if (q) {
    Object.assign(whereUser, {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const users = await prisma.user.findMany({
    where: whereUser,
    select: { id: true, email: true, name: true, approvalStatus: true, isActive: true, role: true },
    take,
    orderBy: { updatedAt: "desc" },
  });

  const rows = await prisma.usageDaily.findMany({
    where: { dateKey, userId: { in: users.map((u) => u.id) } },
    select: { userId: true, totalTokens: true, promptTokens: true, completionTokens: true },
  });
  const byUserId = new Map(rows.map((r) => [r.userId, r]));
  const limit = Number(FREE_DAILY_TOKEN_LIMIT || 0);

  const out = users.map((u) => {
    const r = byUserId.get(u.id);
    const used = r
      ? (Number(r.totalTokens || 0) > 0 ? Number(r.totalTokens || 0) : Number(r.promptTokens || 0) + Number(r.completionTokens || 0))
      : 0;
    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      approvalStatus: u.approvalStatus,
      isActive: u.isActive,
      usedTokens: used,
      limitTokens: limit,
      unlimited: limit === 0,
      remainingTokens: limit === 0 ? null : Math.max(0, limit - used),
    };
  }).sort((a, b) => b.usedTokens - a.usedTokens);

  res.json({ dateKey, limitTokens: limit, unlimited: limit === 0, users: out });
});

/** รายชื่อผู้ใช้ทั้งหมด (รวมรออนุมัติ) — admin และ admin_metrics ใช้หน้า Supportadmin เห็นกระดิ่ง/Overview เดียวกัน */
adminRouter.get("/users", authenticate, requireAdminMetrics, async (_req, res) => {
  const hasExpiry = await hasUserExpiresAtColumn();
  if (hasExpiry) {
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
      _count: {
        select: {
          documents: true,
          conversations: true,
          messages: true,
          bots: true,
        },
      },
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
        hasExpiry && user.role === "user" && user.createdAt
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
        lastActivityAt,
        counts: user._count,
        expiresAt: hasExpiry ? (user.expiresAt || expiryFallback) : null,
      };
    }),
  );
});

const ALLOWED_ROLES = ["user", "support", "admin_metrics", "admin"];
const GROUP_CHAT_KIND = "group";

adminRouter.patch("/users/:id", authenticate, requireAdmin, async (req, res) => {
  const { role, isActive } = req.body ?? {};
  if (role === undefined && isActive === undefined) {
    res.status(400).json({ error: "role or isActive is required" });
    return;
  }
  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      role: role ?? undefined,
      isActive: isActive ?? undefined,
      approvalStatus: role && role !== "user" ? "approved" : undefined,
    },
  });

  res.json(sanitizeUser(updated));
});

adminRouter.delete("/users/:id", authenticate, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  if (req.user?.id === userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logEvent({
    event: "admin.user.deleted",
    actorId: req.user.id,
    targetType: "user",
    targetId: userId,
    meta: { email: user.email, name: user.name, ...getRequestContext(req) },
  });
  await prisma.user.delete({ where: { id: userId } });
  res.json({ ok: true });
});

const toGroupDto = (chat) => ({
  id: chat.id,
  roomId: chat.id,
  name: String(chat.name || "กลุ่ม"),
  description: String(chat.description || ""),
  memberCount: Array.isArray(chat.users) ? chat.users.length : 0,
  members: Array.isArray(chat.users) ? chat.users.map((link) => link.userId) : [],
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
});

adminRouter.get("/groups", authenticate, requireRole("support", "admin"), async (_req, res) => {
  const groups = await prisma.chat.findMany({
    where: { kind: GROUP_CHAT_KIND },
    include: { users: { select: { userId: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(groups.map(toGroupDto));
});

adminRouter.post("/groups", authenticate, requireRole("support", "admin"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const memberIdsRaw = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
  const memberIds = Array.from(new Set(memberIdsRaw.map((id) => String(id || "").trim()).filter(Boolean)));
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const users = memberIds.length
    ? await prisma.user.findMany({
        where: { id: { in: memberIds }, role: "user" },
        select: { id: true },
      })
    : [];
  const validMemberIds = users.map((user) => user.id);
  const created = await prisma.chat.create({
    data: {
      name: name.slice(0, 120),
      description: description.slice(0, 500),
      kind: GROUP_CHAT_KIND,
      users: validMemberIds.length
        ? { create: validMemberIds.map((userId) => ({ userId, role: "member" })) }
        : undefined,
    },
    include: { users: { select: { userId: true } } },
  });
  res.status(201).json(toGroupDto(created));
});

adminRouter.patch("/groups/:id", authenticate, requireRole("support", "admin"), async (req, res) => {
  const groupId = String(req.params.id || "").trim();
  const name = req.body?.name;
  const description = req.body?.description;
  if (!groupId) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const group = await prisma.chat.findFirst({ where: { id: groupId, kind: GROUP_CHAT_KIND }, select: { id: true } });
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const updated = await prisma.chat.update({
    where: { id: group.id },
    data: {
      ...(name !== undefined ? { name: String(name || "").trim().slice(0, 120) || "กลุ่ม" } : {}),
      ...(description !== undefined ? { description: String(description || "").trim().slice(0, 500) } : {}),
    },
    include: { users: { select: { userId: true } } },
  });
  res.json(toGroupDto(updated));
});

adminRouter.put("/groups/:id/members", authenticate, requireRole("support", "admin"), async (req, res) => {
  const groupId = String(req.params.id || "").trim();
  const memberIdsRaw = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
  const memberIds = Array.from(new Set(memberIdsRaw.map((id) => String(id || "").trim()).filter(Boolean)));
  if (!groupId) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const group = await prisma.chat.findFirst({ where: { id: groupId, kind: GROUP_CHAT_KIND }, select: { id: true } });
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const users = memberIds.length
    ? await prisma.user.findMany({
        where: { id: { in: memberIds }, role: "user" },
        select: { id: true },
      })
    : [];
  const validMemberIds = users.map((user) => user.id);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.chatUser.deleteMany({ where: { chatId: group.id } });
    if (validMemberIds.length) {
      await tx.chatUser.createMany({
        data: validMemberIds.map((userId) => ({ chatId: group.id, userId, role: "member" })),
        skipDuplicates: true,
      });
    }
    return tx.chat.findUnique({
      where: { id: group.id },
      include: { users: { select: { userId: true } } },
    });
  });
  res.json(toGroupDto(updated));
});

adminRouter.delete("/groups/:id", authenticate, requireRole("support", "admin"), async (req, res) => {
  const groupId = String(req.params.id || "").trim();
  if (!groupId) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const group = await prisma.chat.findFirst({ where: { id: groupId, kind: GROUP_CHAT_KIND }, select: { id: true } });
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  await prisma.chat.delete({ where: { id: group.id } });
  res.json({ ok: true });
});

adminRouter.get("/documents", authenticate, requireRole("support", "admin"), async (_req, res) => {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      owner: { select: { id: true, name: true } },
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

adminRouter.get("/bots", authenticate, requireRole("support", "admin"), async (_req, res) => {
  const bots = await prisma.bot.findMany({
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

adminRouter.patch("/bots/:id", authenticate, requireRole("support", "admin"), async (req, res) => {
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

adminRouter.get("/backup", authenticate, requireAdmin, async (_req, res) => {
  const [
    users,
    documents,
    shares,
    bots,
    botDocuments,
    conversations,
    messages,
    uploadBatches,
    uploadFiles,
    usageDaily,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.document.findMany(),
    prisma.documentShare.findMany(),
    prisma.bot.findMany(),
    prisma.botDocument.findMany(),
    prisma.conversation.findMany(),
    prisma.message.findMany(),
    prisma.uploadBatch.findMany(),
    prisma.uploadFile.findMany(),
    prisma.usageDaily.findMany(),
  ]);

  res.json({
    users,
    documents,
    shares,
    bots,
    botDocuments,
    conversations,
    messages,
    uploadBatches,
    uploadFiles,
    usageDaily,
  });
});

adminRouter.post("/restore", authenticate, requireAdmin, async (req, res) => {
  const payload = req.body ?? {};
  try {
    await prisma.$transaction(async (tx) => {
      if (Array.isArray(payload.users) && payload.users.length) {
        await tx.user.createMany({ data: payload.users, skipDuplicates: true });
      }
      if (Array.isArray(payload.documents) && payload.documents.length) {
        await tx.document.createMany({ data: payload.documents, skipDuplicates: true });
      }
      if (Array.isArray(payload.shares) && payload.shares.length) {
        await tx.documentShare.createMany({ data: payload.shares, skipDuplicates: true });
      }
      if (Array.isArray(payload.bots) && payload.bots.length) {
        await tx.bot.createMany({ data: payload.bots, skipDuplicates: true });
      }
      if (Array.isArray(payload.botDocuments) && payload.botDocuments.length) {
        await tx.botDocument.createMany({ data: payload.botDocuments, skipDuplicates: true });
      }
      if (Array.isArray(payload.conversations) && payload.conversations.length) {
        await tx.conversation.createMany({ data: payload.conversations, skipDuplicates: true });
      }
      if (Array.isArray(payload.messages) && payload.messages.length) {
        await tx.message.createMany({ data: payload.messages, skipDuplicates: true });
      }
      if (Array.isArray(payload.uploadBatches) && payload.uploadBatches.length) {
        await tx.uploadBatch.createMany({ data: payload.uploadBatches, skipDuplicates: true });
      }
      if (Array.isArray(payload.uploadFiles) && payload.uploadFiles.length) {
        await tx.uploadFile.createMany({ data: payload.uploadFiles, skipDuplicates: true });
      }
      if (Array.isArray(payload.usageDaily) && payload.usageDaily.length) {
        await tx.usageDaily.createMany({ data: payload.usageDaily, skipDuplicates: true });
      }
    });
    await logEvent({
      event: "admin.restore",
      actorId: req.user.id,
      targetType: "backup",
      targetId: null,
      meta: { ...getRequestContext(req) },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("Restore failed", error);
    await logEvent({
      level: "error",
      event: "admin.restore.failed",
      actorId: req.user.id,
      targetType: "backup",
      targetId: null,
      outcome: "failed",
      meta: { error: error instanceof Error ? error.message : String(error), ...getRequestContext(req) },
    });
    res.status(500).json({ error: "Restore failed" });
  }
});
