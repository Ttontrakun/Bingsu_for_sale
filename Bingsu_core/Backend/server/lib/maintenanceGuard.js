import { getOrCreateMaintenance, toMaintenancePublic } from "../routes/announcements.js";
import { getTokenFromRequest, lookupSessionUser } from "./auth.js";

const STAFF_ROLES = new Set(["support", "admin", "admin_metrics", "admin_dev"]);

const ALLOW_PREFIXES = [
  "/api/ping",
  "/api/health",
  "/api/auth",
  "/api/announcements/maintenance",
  "/api/config",
  "/api/webhooks",
  "/api/internal",
  "/api/admin",
  "/api/support",
  "/api/dev",
  "/api/avatars",
];

let cache = { at: 0, enabled: false, payload: null };
const CACHE_MS = 3000;

const isAllowedPath = (urlPath) =>
  ALLOW_PREFIXES.some((prefix) => urlPath === prefix || urlPath.startsWith(`${prefix}/`) || urlPath.startsWith(`${prefix}?`));

async function readMaintenance() {
  const now = Date.now();
  if (now - cache.at < CACHE_MS && cache.payload) return cache;
  try {
    const row = await getOrCreateMaintenance();
    cache = { at: now, enabled: Boolean(row?.enabled), payload: toMaintenancePublic(row) };
  } catch (err) {
    console.error("[maintenanceGuard]", err?.message || err);
    return cache.payload ? cache : { at: now, enabled: false, payload: null };
  }
  return cache;
}

export async function maintenanceGuard(req, res, next) {
  const urlPath = String(req.originalUrl || req.path || "").split("?")[0];
  if (!urlPath.startsWith("/api/") && urlPath !== "/api") {
    return next();
  }
  if (isAllowedPath(urlPath)) return next();

  const state = await readMaintenance();
  if (!state.enabled) return next();

  const token = getTokenFromRequest(req);
  if (token) {
    try {
      const user = await lookupSessionUser(token);
      if (user && STAFF_ROLES.has(user.role)) return next();
    } catch {
      /* treat as regular user */
    }
  }

  res.status(503).json({
    error: "maintenance",
    ...(state.payload || {}),
  });
}
