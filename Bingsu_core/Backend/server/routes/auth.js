import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
import crypto from "crypto";
import { prisma } from "../db.js";
import { rateLimit } from "../lib/rateLimit.js";
import { authenticate, sanitizeUser } from "../lib/auth.js";
import { getRequestContext } from "../lib/requestContext.js";
import { logEvent } from "../lib/logging.js";
import { clearLoginLock, isLoginLocked, recordFailedLogin } from "../lib/loginGuard.js";
import { createSession } from "../services/sessions.js";
import { ensureUserDefaultBot } from "./support.js";
import {
  emailFeatures,
  sendPasswordResetEmail,
  sendSupportPendingApprovalEmail,
  sendVerificationEmail,
} from "../services/email.js";
import { FREE_DAILY_TOKEN_LIMIT } from "../config.js";
import { getDateKey, getOrCreateUsageDaily } from "../services/usage.js";
import {
  emailVerificationTokenTtlHours,
  passwordResetTokenTtlHours,
  requireEmailVerification,
  isProduction,
  allowSignupAutoApprove,
  sessionCookieDomain,
  sessionCookieName,
  sessionCookieSameSite,
  sessionCookieSecure,
} from "../config.js";

export const authRouter = express.Router();

const buildExpiryDate = (hours) => {
  const ttlHours = Number.isFinite(hours) && hours > 0 ? hours : 1;
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000);
};

const createToken = () => crypto.randomBytes(24).toString("hex");

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");

const normalizeSameSite = (value) => {
  const v = String(value || "lax").toLowerCase();
  if (v === "strict" || v === "none" || v === "lax") return v;
  return "lax";
};

const buildSessionCookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: !!sessionCookieSecure,
  sameSite: normalizeSameSite(sessionCookieSameSite),
  path: "/",
  expires: expiresAt instanceof Date ? expiresAt : undefined,
  ...(sessionCookieDomain ? { domain: sessionCookieDomain } : {}),
});

/** Handler สำหรับสมัครสมาชิก — ใช้ได้ทั้ง POST /api/auth/signup และ POST /api/users/register */
export async function signupHandler(req, res) {
  const body = req.body ?? {};
  const { email, password, name: nameArg, acceptedTerms } = body;
  const fullName = body.fullName ?? nameArg;
  const name = fullName != null && String(fullName).trim() !== "" ? String(fullName).trim() : nameArg;
  const context = getRequestContext(req);

  if (!email || !name) {
    res.status(400).json({ error: "name (or fullName) and email are required" });
    return;
  }
  if (acceptedTerms !== true) {
    res.status(400).json({ error: "You must accept terms before registering" });
    return;
  }
  if (!(await rateLimit(`auth:${context.ip || "unknown"}`))) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  const rawPassword = password != null && String(password).trim() !== "" ? String(password) : null;
  if (rawPassword !== null && rawPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  const passwordToUse = rawPassword ?? crypto.randomBytes(16).toString("hex");
  const verificationToken = createToken();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(passwordToUse, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      approvalStatus: isProduction && !allowSignupAutoApprove ? "pending" : "approved",
      emailVerifiedAt: requireEmailVerification ? null : new Date(),
      emailVerificationToken: hashToken(verificationToken),
      emailVerificationExpiresAt: buildExpiryDate(emailVerificationTokenTtlHours),
    },
  });

  await logEvent({
    event: "user.signup.pending",
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
    meta: { email: user.email, name: user.name, ...context },
  });

  try {
    if (requireEmailVerification) {
      await sendVerificationEmail({
        email: user.email,
        name: user.name,
        token: verificationToken,
      });
    }
  } catch (emailErr) {
    console.error("[auth] signup email failed:", emailErr?.message || emailErr);
    if (isProduction) {
      res.status(500).json({ error: "Cannot send verification email. Please contact support." });
      return;
    }
  }

  res.status(201).json({
    user: sanitizeUser(user),
    pending: true,
    verificationRequired: requireEmailVerification,
    verificationEmailSent: emailFeatures.isConfigured(),
    verificationToken: !isProduction ? verificationToken : undefined,
  });
}

authRouter.post("/signup", signupHandler);

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const context = getRequestContext(req);

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    const allowed = await rateLimit(`auth:${context.ip || "unknown"}`);
    if (!allowed) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    if (user.isActive === false) {
      res.status(403).json({ error: "Account is disabled" });
      return;
    }
    if (requireEmailVerification && user.role === "user" && !user.emailVerifiedAt) {
      res.status(403).json({ error: "Email not verified" });
      return;
    }
    if (user.role === "user" && user.approvalStatus !== "approved") {
      res.status(403).json({
        error: user.approvalStatus === "rejected" ? "Account rejected" : "Account pending approval",
      });
      return;
    }

    const lockState = await isLoginLocked(email, context.ip || "unknown");
    if (lockState.locked) {
      res.status(429).json({ error: "Too many login attempts. Please try again later." });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      await recordFailedLogin(email, context.ip || "unknown");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    await clearLoginLock(email, context.ip || "unknown");

    const session = await createSession(user.id);

    // สร้างบอทเริ่มต้นอัตโนมัติถ้า user ยังไม่มี (กัน edge case ที่สร้างบัญชีก่อนฟีเจอร์นี้)
    if (user.role === "user" && user.approvalStatus === "approved") {
      ensureUserDefaultBot(user.id).catch((e) =>
        console.error("[auth] ensureUserDefaultBot failed:", e?.message)
      );
    }

    logEvent({
      event: "auth.login",
      actorId: user.id,
      targetType: "session",
      targetId: session.id,
      meta: { email: user.email, name: user.name, role: user.role, ...context },
    }).catch((err) => console.error("[auth] logEvent failed:", err));

    res.cookie(sessionCookieName, session.token, buildSessionCookieOptions(session.expiresAt));
    res.json({
      user: sanitizeUser(user),
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    console.error("[auth] login error:", err?.message || err, err?.stack);
    res.status(500).json({ error: "Login failed. Try again or contact support." });
  }
});

authRouter.post("/verify-email", async (req, res) => {
  const { token } = req.body ?? {};
  const context = getRequestContext(req);

  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  if (!(await rateLimit(`auth:${context.ip || "unknown"}`))) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  const tokenHash = hashToken(token);
  const now = new Date();
  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: tokenHash,
    },
  });
  if (!user) {
    res.status(400).json({ error: "Invalid or expired token" });
    return;
  }

  const emailTokenValid =
    user.emailVerificationToken === tokenHash
    && (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt >= now);

  if (!emailTokenValid) {
    res.status(400).json({ error: "Invalid or expired token" });
    return;
  }

  const passwordSetupToken = createToken();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      // Generate a fresh one-time password setup token.
      // This makes "latest verification link only" behavior explicit.
      passwordResetToken: hashToken(passwordSetupToken),
      passwordResetExpiresAt: buildExpiryDate(passwordResetTokenTtlHours),
    },
  });
  await logEvent({
    event: "auth.email.verified",
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
    meta: { ...context },
  });

  res.json({ ok: true, passwordSetupToken });
});

authRouter.post("/resend-verification", async (req, res) => {
  const { email } = req.body ?? {};
  const context = getRequestContext(req);

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }
  if (!(await rateLimit(`auth:${context.ip || "unknown"}`))) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerifiedAt) {
    res.json({ ok: true });
    return;
  }

  const token = createToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: hashToken(token),
      emailVerificationExpiresAt: buildExpiryDate(emailVerificationTokenTtlHours),
    },
  });
  await logEvent({
    event: "auth.email.resend",
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
    meta: { email: user.email, ...context },
  });

  try {
    await sendVerificationEmail({
      email: user.email,
      name: user.name,
      token,
    });
  } catch (emailErr) {
    console.error("[auth] resend verification email failed:", emailErr?.message || emailErr);
    if (isProduction) {
      res.status(500).json({ error: "Cannot send verification email. Please contact support." });
      return;
    }
  }

  res.json({
    ok: true,
    verificationEmailSent: emailFeatures.isConfigured(),
    verificationToken: !isProduction ? token : undefined,
  });
});

const handleRequestPasswordReset = async (req, res) => {
  const { email } = req.body ?? {};
  const context = getRequestContext(req);

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }
  if (!(await rateLimit(`auth:${context.ip || "unknown"}`))) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = createToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashToken(token),
        passwordResetExpiresAt: buildExpiryDate(passwordResetTokenTtlHours),
      },
    });
    await logEvent({
      event: "auth.password.reset.requested",
      actorId: user.id,
      targetType: "user",
      targetId: user.id,
      meta: { email: user.email, ...context },
    });
    try {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        token,
      });
    } catch (emailErr) {
      console.error("[auth] password reset email failed:", emailErr?.message || emailErr);
      if (isProduction) {
        res.status(500).json({ error: "Cannot send reset email. Please contact support." });
        return;
      }
    }
    res.json({
      ok: true,
      resetEmailSent: emailFeatures.isConfigured(),
      resetToken: !isProduction ? token : undefined,
    });
    return;
  }

  res.json({ ok: true });
};

authRouter.post("/request-password-reset", handleRequestPasswordReset);
// Alias for frontend compatibility
authRouter.post("/forgot-password", handleRequestPasswordReset);

const consumePasswordToken = async ({
  token,
  password,
  eventName,
  context,
  res,
}) => {
  if (!token || !password) {
    res.status(400).json({ error: "token and newPassword are required" });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  if (!(await rateLimit(`auth:${context.ip || "unknown"}`))) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: tokenHash },
  });
  if (!user || (user.passwordResetExpiresAt && user.passwordResetExpiresAt < new Date())) {
    res.status(400).json({ error: "Invalid or expired token" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await logEvent({
    event: eventName,
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
    meta: { ...context },
  });

  if (eventName === "auth.password.set.initial" && user.role === "user" && user.approvalStatus === "pending") {
    try {
      await sendSupportPendingApprovalEmail({
        email: user.email,
        name: user.name,
        userId: user.id,
      });
    } catch (emailErr) {
      console.error("[auth] support pending approval email failed:", emailErr?.message || emailErr);
      if (isProduction) {
        res.status(500).json({ error: "Password saved but failed to notify support. Please contact support." });
        return;
      }
    }
  }

  res.json({ ok: true });
};

authRouter.post("/reset-password", async (req, res) => {
  const { token, newPassword, password } = req.body ?? {};
  const context = getRequestContext(req);
  await consumePasswordToken({
    token,
    password: newPassword ?? password,
    eventName: "auth.password.reset",
    context,
    res,
  });
});

// ตั้งรหัสผ่านครั้งแรกหลัง verify email สำเร็จ
authRouter.post("/set-password", async (req, res) => {
  const { token, password, newPassword } = req.body ?? {};
  const context = getRequestContext(req);
  await consumePasswordToken({
    token,
    password: newPassword ?? password,
    eventName: "auth.password.set.initial",
    context,
    res,
  });
});

authRouter.post("/change-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  const context = getRequestContext(req);

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (String(newPassword).length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const user = req.user;
  const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!validPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  await prisma.session.deleteMany({
    where: { userId: user.id, id: { not: req.session.id } },
  });
  await logEvent({
    event: "auth.password.changed",
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
    meta: { ...context },
  });

  res.json({ ok: true });
});

authRouter.get("/me", authenticate, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

authRouter.patch("/me", authenticate, async (req, res) => {
  try {
    const { name, avatarUrl: avatarUrlInput, avatarBase64 } = req.body ?? {};
    const beforeAvatarUrl = req.user?.avatarUrl ?? null;
    const updates = {};
    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim();
    }

    let avatarUrl = avatarUrlInput;
    if (typeof avatarBase64 === "string" && avatarBase64.startsWith("data:image/")) {
      const match = avatarBase64.match(/^data:image\/(\w+);base64,([\s\S]+)$/);
      if (match) {
        const rawExt = match[1] === "jpeg" ? "jpg" : match[1];
        const safeExt = /^[a-z0-9]+$/i.test(rawExt) ? rawExt.toLowerCase() : "png";
        const base64Data = match[2].replace(/\s/g, "");
        const buffer = Buffer.from(base64Data, "base64");
        const dir = path.join(projectRoot, "uploads", "avatars");
        fs.mkdirSync(dir, { recursive: true });
        const fileName = `${req.user.id}.${safeExt}`;
        const filePath = path.join(dir, fileName);
        fs.writeFileSync(filePath, buffer);
        avatarUrl = `/uploads/avatars/${fileName}`;
      }
    }
    if (typeof avatarUrl === "string") {
      updates.avatarUrl = avatarUrl.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ user: sanitizeUser(req.user) });
    }
    const userId = req.user.id;
    if (updates.name !== undefined && updates.avatarUrl !== undefined) {
      await prisma.$executeRaw`
        UPDATE "User" SET "name" = ${updates.name}, "avatarUrl" = ${updates.avatarUrl}, "updatedAt" = NOW() WHERE "id" = ${userId}
      `;
    } else if (updates.avatarUrl !== undefined) {
      await prisma.$executeRaw`
        UPDATE "User" SET "avatarUrl" = ${updates.avatarUrl}, "updatedAt" = NOW() WHERE "id" = ${userId}
      `;
    } else if (updates.name !== undefined) {
      await prisma.$executeRaw`
        UPDATE "User" SET "name" = ${updates.name}, "updatedAt" = NOW() WHERE "id" = ${userId}
      `;
    }
    const updated = await prisma.user.findUnique({ where: { id: userId } });
    await logEvent({
      event: "user.profile.updated",
      actorId: userId,
      targetType: "user",
      targetId: userId,
      meta: {
        changed: {
          name: updates.name !== undefined,
          avatarUrl: updates.avatarUrl !== undefined,
        },
        avatar: updates.avatarUrl !== undefined
          ? { from: beforeAvatarUrl, to: updates.avatarUrl ?? null }
          : undefined,
      },
    });
    return res.json({ user: sanitizeUser(updated || req.user) });
  } catch (err) {
    console.error("PATCH /me error:", err);
    const message = err.meta?.column_name
      ? "ฐานข้อมูลยังไม่มีฟิลด์รูปโปรไฟล์ — รันคำสั่ง: npx prisma migrate deploy"
      : (err.message || "อัปเดตโปรไฟล์ไม่สำเร็จ");
    return res.status(500).json({ error: message });
  }
});

authRouter.post("/logout", authenticate, async (req, res) => {
  try {
    await prisma.session.deleteMany({ where: { id: req.session.id } });
    await logEvent({
      event: "auth.logout",
      actorId: req.user?.id,
      targetType: "session",
      targetId: req.session.id,
      meta: {
        email: req.user?.email,
        name: req.user?.name,
        role: req.user?.role,
        ...getRequestContext(req),
      },
    });
  } catch (error) {
    console.error("Logout failed", error);
  }
  res.clearCookie(sessionCookieName, {
    path: "/",
    ...(sessionCookieDomain ? { domain: sessionCookieDomain } : {}),
  });
  res.json({ ok: true });
});

/**
 * โควต้าโทเค็นของผู้ใช้ (วันนี้)
 * ใช้สำหรับหน้า user ให้เห็น "ใช้ไป/เต็ม" และ Support Admin เอาไปทำ dashboard ได้
 */
authRouter.get("/quota", authenticate, async (req, res) => {
  const dateKey = getDateKey();
  const row = await getOrCreateUsageDaily(req.user.id);
  const used = Number(row.totalTokens || 0) > 0
    ? Number(row.totalTokens || 0)
    : Number(row.promptTokens || 0) + Number(row.completionTokens || 0);
  const limit = Number(FREE_DAILY_TOKEN_LIMIT || 0);
  res.json({
    dateKey,
    usedTokens: used,
    limitTokens: limit,
    unlimited: limit === 0,
  });
});
