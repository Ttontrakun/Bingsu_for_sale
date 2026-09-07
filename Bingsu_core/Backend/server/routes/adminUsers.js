/**
 * เส้นทางจัดการผู้ใช้ของแอดมิน (list, patch role/status, reset-password, delete)
 * ย้ายมาจาก routes/admin.js (refactor แยกไฟล์ ไม่เปลี่ยนพฤติกรรม) — mount ผ่าน adminRouter.use()
 */
import express from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { authenticate, requireAdmin, requireAdminMetrics, requireRole, sanitizeUser } from "../lib/auth.js";
import { getRequestContext } from "../lib/requestContext.js";
import { logEvent } from "../lib/logging.js";
import { getLastActivityByUserIds } from "../lib/lastUserActivity.js";
import { invalidateUserCaches } from "../lib/cache.js";
import { bcryptRounds } from "../config.js";

export const adminUsersRouter = express.Router();

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

/** รายชื่อผู้ใช้ทั้งหมด (รวมรออนุมัติ) — admin และ admin_metrics ใช้หน้า Supportadmin เห็นกระดิ่ง/Overview เดียวกัน */
adminUsersRouter.get("/users", authenticate, requireAdminMetrics, async (_req, res) => {
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
      emailVerifiedAt: true,
      emailVerificationToken: true,
      passwordResetToken: true,
      passwordResetExpiresAt: true,
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
        approvalReady:
          user.approvalStatus === "pending" &&
          user.role === "user" &&
          !!user.emailVerifiedAt &&
          user.emailVerificationToken === null &&
          user.passwordResetToken === null &&
          user.passwordResetExpiresAt === null,
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

const ALLOWED_ROLES = ["user", "support", "admin_metrics", "admin", "admin_dev"];
const GROUP_CHAT_KIND = "group";

adminUsersRouter.patch("/users/:id", authenticate, requireRole("support", "admin", "admin_metrics"), async (req, res) => {
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
  const actorRole = String(req.user?.role || "");
  const actorIsAdmin = actorRole === "admin";
  const actorIsStaff = ["support", "admin_metrics"].includes(actorRole);
  if (role !== undefined && !actorIsAdmin) {
    res.status(403).json({ error: "Only admin can change role" });
    return;
  }
  if (actorIsStaff && target.role !== "user") {
    res.status(403).json({ error: "Support can update only role=user accounts" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be boolean" });
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

  const metaBase = {
    email: updated.email,
    name: updated.name,
    ...getRequestContext(req),
  };
  if (typeof isActive === "boolean" && isActive !== target.isActive) {
    await logEvent({
      event: "user.status.updated",
      actorId: req.user.id,
      targetType: "user",
      targetId: updated.id,
      meta: {
        ...metaBase,
        from: target.isActive,
        to: isActive,
      },
    });
  }
  if (typeof role === "string" && role !== target.role) {
    await logEvent({
      event: "user.role.updated",
      actorId: req.user.id,
      targetType: "user",
      targetId: updated.id,
      meta: {
        ...metaBase,
        from: target.role,
        to: role,
      },
    });
  }

  res.json(sanitizeUser(updated));
});

adminUsersRouter.post("/users/:id/reset-password", authenticate, requireAdmin, async (req, res) => {
  const { newPassword, password } = req.body ?? {};
  const nextPassword = String(newPassword ?? password ?? "");
  if (!nextPassword) {
    res.status(400).json({ error: "newPassword is required" });
    return;
  }
  if (nextPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (String(req.user?.id || "") === String(target.id || "")) {
    res.status(400).json({ error: "Cannot reset your own password from this action" });
    return;
  }

  const passwordHash = await bcrypt.hash(nextPassword, bcryptRounds);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
  ]);

  await logEvent({
    event: "admin.user.password.reset",
    actorId: req.user.id,
    targetType: "user",
    targetId: target.id,
    meta: {
      email: target.email,
      name: target.name,
      role: target.role,
      ...getRequestContext(req),
    },
  });
  await invalidateUserCaches(target.id);

  res.json({ ok: true });
});

adminUsersRouter.delete("/users/:id", authenticate, requireAdmin, async (req, res) => {
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
