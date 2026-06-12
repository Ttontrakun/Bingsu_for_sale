import { prisma } from "../db.js";
import crypto from "crypto";
import { sessionCookieName } from "../config.js";

const SENSITIVE_KEYS = ["passwordHash", "emailVerificationToken", "passwordResetToken"];
const hashSessionToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");

/**
 * Get bearer token from Authorization header or cookie.
 */
function getToken(req) {
  const auth = req.headers.authorization;
  if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return req.cookies?.[sessionCookieName] ?? req.cookies?.session_token ?? req.cookies?.token ?? null;
}

/**
 * Middleware: require authenticated user. Sets req.user and req.session.
 */
export async function authenticate(req, res, next) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { token: tokenHash },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  if (!session.user.isActive) {
    res.status(403).json({ error: "Account is disabled" });
    return;
  }
  req.session = session;
  req.user = session.user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin required" });
    return;
  }
  next();
}

export function requireAdminMetrics(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.role !== "admin_metrics") {
    res.status(403).json({ error: "Admin or admin_metrics required" });
    return;
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}

export function sanitizeUser(user) {
  if (!user) return null;
  const out = { ...user };
  SENSITIVE_KEYS.forEach((k) => delete out[k]);
  return out;
}
