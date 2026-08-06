/**
 * เส้นทาง dashboard/กราฟของ Support Admin (metrics, activity, faq-categories,
 * top-cited-documents, token-usage, user-role-distribution, token-quota)
 * ย้ายมาจาก routes/admin.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม) — mount ผ่าน adminRouter.use()
 */
import express from "express";
import { prisma } from "../db.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { FREE_DAILY_TOKEN_LIMIT } from "../config.js";
import { getDateKey } from "../services/usage.js";

export const adminMetricsRouter = express.Router();

const HELP_BOT_NAME = "บอทช่วยสอน";
const pendingApprovalReadyFilter = {
  approvalStatus: "pending",
  role: "user",
  emailVerifiedAt: { not: null },
  emailVerificationToken: null,
  passwordResetToken: null,
  passwordResetExpiresAt: null,
};

adminMetricsRouter.get("/metrics", authenticate, requireRole("support", "admin", "admin_metrics"), async (_req, res) => {
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
    prisma.user.count({ where: pendingApprovalReadyFilter }),
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

adminMetricsRouter.get("/activity", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
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
adminMetricsRouter.get("/faq-categories", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
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
 * เอกสารที่ถูกอ้างอิงบ่อย (Most-cited knowledge documents)
 * นับจาก references ที่ผูกกับคำตอบของบอท (role = "model") ในช่วงเวลาที่กำหนด
 * นับ 1 ครั้งต่อ 1 คำตอบต่อ 1 เอกสาร (dedupe ต่อข้อความ) = "จำนวนคำตอบที่อ้างอิงเอกสารนี้"
 * คืนรูปแบบเดียวกับ faq-categories: { categories: [{ type, count, percentage, docId }], ... }
 */
adminMetricsRouter.get("/top-cited-documents", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
  const scope = String(req.query?.scope || "all").toLowerCase(); // all | user
  const daysRaw = Number(req.query?.days);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 30;
  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(100, Math.min(50000, Math.floor(limitRaw))) : 20000;
  const topRaw = Number(req.query?.top);
  const top = Number.isFinite(topRaw) ? Math.max(3, Math.min(30, Math.floor(topRaw))) : 12;

  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = {
    role: "model",
    createdAt: { gte: from },
  };
  // scope "user" = เฉพาะบทสนทนาที่เจ้าของเป็น role = user
  if (scope === "user") {
    Object.assign(where, { conversation: { user: { role: "user" } } });
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { references: true },
  });

  const counts = new Map(); // docId -> { docId, name, count }
  for (const m of messages) {
    const refs = Array.isArray(m?.references) ? m.references : [];
    if (refs.length === 0) continue;
    const seen = new Set(); // นับครั้งเดียวต่อข้อความ
    for (const r of refs) {
      const docId = r?.docId;
      if (!docId || docId === "__private__") continue;
      if (seen.has(docId)) continue;
      seen.add(docId);
      const name = String(r?.displayName || "เอกสาร").trim() || "เอกสาร";
      const cur = counts.get(docId) || { docId, name, count: 0 };
      cur.count += 1;
      if ((!cur.name || cur.name === "เอกสาร") && name) cur.name = name;
      counts.set(docId, cur);
    }
  }

  const arr = [...counts.values()];
  const totalCount = arr.reduce((sum, c) => sum + c.count, 0);
  const categories = arr
    .map((c) => ({
      type: c.name,
      count: c.count,
      percentage: totalCount > 0 ? Number(((c.count / totalCount) * 100).toFixed(1)) : 0,
      docId: c.docId,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);

  res.json({ categories, totalCount, days, scope, truncated: messages.length >= limit });
});

/**
 * Token usage รายวัน (ข้อมูลจริงจาก UsageDaily)
 * ใช้สำหรับกราฟ "การใช้ Token รายวัน" ใน Support Admin Dashboard
 */
adminMetricsRouter.get("/token-usage", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
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
adminMetricsRouter.get("/user-role-distribution", authenticate, requireRole("support", "admin", "admin_metrics"), async (_req, res) => {
  const [userActive, userPending, supportCount, adminCount] = await Promise.all([
    prisma.user.count({
      where: {
        role: "user",
        approvalStatus: { in: ["approved", "rejected"] },
      },
    }),
    prisma.user.count({ where: pendingApprovalReadyFilter }),
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
adminMetricsRouter.get("/token-quota", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
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

/**
 * รายงาน "คำถามที่บอทตอบไม่ได้" — หา reply แบบ no-data จากประวัติข้อความโดยตรง (ได้ข้อมูลย้อนหลังทั้งหมด
 * ไม่ต้อง log เพิ่ม) แล้วจับคู่กับคำถามผู้ใช้ล่าสุดก่อนหน้าในห้องเดียวกัน จากนั้นจัดกลุ่มคำถามซ้ำ
 */
adminMetricsRouter.get("/no-answer-questions", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
  const daysRaw = Number(req.query?.days);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(180, Math.floor(daysRaw))) : 30;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw`
    SELECT m."id", m."createdAt", m."conversationId", c."userId",
           u."email" AS "userEmail", u."name" AS "userName",
           q."content" AS "question", m."content" AS "reply"
    FROM "Message" m
    JOIN "Conversation" c ON c."id" = m."conversationId"
    LEFT JOIN "User" u ON u."id" = c."userId"
    LEFT JOIN LATERAL (
      SELECT "content" FROM "Message" prev
      WHERE prev."conversationId" = m."conversationId"
        AND prev."role" = 'user'
        AND prev."createdAt" <= m."createdAt"
        AND prev."id" <> m."id"
      ORDER BY prev."createdAt" DESC
      LIMIT 1
    ) q ON true
    WHERE m."role" = 'model'
      AND m."createdAt" >= ${from}
      AND (
        m."content" LIKE 'ขออภัยครับ ยังไม่พบข้อมูลที่ตรงจากเอกสารที่เลือก%'
        OR m."content" LIKE 'ขออภัยครับ ไม่มีข้อมูลโปรเน็ตบ้านในเอกสารที่เลือก%'
        OR m."content" LIKE 'ไม่มีข้อมูลในเอกสารสำหรับค่าบริการ%'
      )
    ORDER BY m."createdAt" DESC
    LIMIT 1000
  `;

  // จัดกลุ่มคำถามที่เหมือนกัน (เทียบแบบ normalize เว้นวรรค/ตัวพิมพ์) เพื่อดูว่าเรื่องไหนถูกถามบ่อย
  const groups = new Map();
  for (const row of rows) {
    const question = String(row.question || "").trim();
    if (!question) continue;
    const key = question.toLowerCase().replace(/\s+/g, " ").slice(0, 300);
    if (!groups.has(key)) {
      groups.set(key, {
        question,
        count: 0,
        lastAskedAt: null,
        users: new Set(),
        sampleReply: String(row.reply || "").slice(0, 200),
      });
    }
    const g = groups.get(key);
    g.count += 1;
    const at = new Date(row.createdAt);
    if (!g.lastAskedAt || at > g.lastAskedAt) g.lastAskedAt = at;
    if (row.userEmail || row.userName) g.users.add(row.userName || row.userEmail);
  }

  const grouped = [...groups.values()]
    .map((g) => ({
      question: g.question,
      count: g.count,
      lastAskedAt: g.lastAskedAt ? g.lastAskedAt.toISOString() : null,
      userCount: g.users.size,
      users: [...g.users].slice(0, 5),
      sampleReply: g.sampleReply,
    }))
    .sort((a, b) => b.count - a.count || String(b.lastAskedAt || "").localeCompare(String(a.lastAskedAt || "")));

  const recent = rows.slice(0, 100).map((row) => ({
    question: String(row.question || "").trim(),
    reply: String(row.reply || "").slice(0, 200),
    userName: row.userName || row.userEmail || "-",
    createdAt: new Date(row.createdAt).toISOString(),
    conversationId: row.conversationId,
  }));

  res.json({ days, totalEvents: rows.length, grouped, recent });
});
