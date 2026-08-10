import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { authenticate, requireRole } from "../lib/auth.js";
import {
  getSystemConfig,
  updateSystemConfig,
  toPublicConfig,
} from "../lib/systemConfig.js";
import {
  COPY_KEYS,
  USER_MENU_CATALOG,
  ADMIN_MENU_CATALOG,
  ADMIN_SYSTEM_TAB_CATALOG,
} from "../lib/featureCatalog.js";
import { parseSafeAvatarDataUrl } from "../lib/avatarSafe.js";
import { logEvent } from "../lib/logging.js";

function summarizeCopyAreas(copyPatch = {}) {
  const keys = Object.keys(copyPatch);
  if (!keys.length) return null;
  const areas = new Set();
  for (const key of keys) {
    if (key.startsWith("admin.login.")) areas.add("Login Supportadmin");
    else if (key.startsWith("user.login.")) areas.add("Login User");
    else if (key.startsWith("user.homepage.") || key.startsWith("user.private.")) areas.add("Homepage User");
    else if (key.startsWith("admin.")) areas.add("ข้อความ Supportadmin");
    else if (key.startsWith("user.")) areas.add("ข้อความ User");
    else areas.add("ข้อความอื่น");
  }
  return `ข้อความ ${keys.length} รายการ (${[...areas].join(", ")})`;
}

function summarizeDevConfigPatch(patch = {}) {
  const changed = [];
  const copySummary = summarizeCopyAreas(patch.copy);
  if (copySummary) changed.push(copySummary);
  if (patch.styles && typeof patch.styles === "object" && Object.keys(patch.styles).length) {
    changed.push(`สไตล์ ${Object.keys(patch.styles).length} รายการ`);
  }
  if (patch.menus?.user) changed.push("เมนู User");
  if (patch.menus?.admin) changed.push("เมนู Supportadmin");
  if (patch.menus?.systemTabs) changed.push("แท็บ System");
  if (patch.features && typeof patch.features === "object" && Object.keys(patch.features).length) {
    changed.push("ฟีเจอร์");
  }
  if (patch.branding && typeof patch.branding === "object") {
    const keys = Object.keys(patch.branding);
    if (keys.includes("logoUrl")) {
      changed.push(
        patch.branding.logoUrl == null || patch.branding.logoUrl === ""
          ? "โลโก้ (กลับค่าเริ่มต้น)"
          : "โลโก้",
      );
    }
    if (keys.includes("appName")) changed.push("ชื่อแอป");
    if (keys.some((k) => k !== "logoUrl" && k !== "appName")) changed.push("แบรนด์");
  }
  if (patch.packageId) changed.push("packageId");
  return changed;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

export const devConfigRouter = express.Router();

const requireAdminDev = [authenticate, requireRole("admin_dev")];

devConfigRouter.get("/config", ...requireAdminDev, async (_req, res) => {
  try {
    const cfg = await getSystemConfig();
    res.json({
      ...cfg,
      catalog: {
        copyKeys: COPY_KEYS,
        userMenus: USER_MENU_CATALOG,
        adminMenus: ADMIN_MENU_CATALOG,
        systemTabs: ADMIN_SYSTEM_TAB_CATALOG,
      },
    });
  } catch (err) {
    console.error("[dev/config GET]", err?.message || err);
    res.status(500).json({ error: "Failed to load dev config" });
  }
});

devConfigRouter.patch("/config", ...requireAdminDev, async (req, res) => {
  try {
    const patch = req.body ?? {};
    const changedAreas = summarizeDevConfigPatch(patch);
    const cfg = await updateSystemConfig(patch, req.user?.id || null);
    const editedAt = cfg?.updatedAt
      ? new Date(cfg.updatedAt).toISOString()
      : new Date().toISOString();
    await logEvent({
      event: "admin_dev.config.updated",
      actorId: req.user?.id || null,
      targetType: "systemConfig",
      targetId: "default",
      meta: {
        actorRole: "admin_dev",
        actorEmail: req.user?.email || null,
        actorName: req.user?.name || null,
        editedAt,
        changedAreas,
        changeSummary: changedAreas.length ? changedAreas.join(" · ") : "บันทึก config",
      },
    }).catch(() => null);
    res.json({
      ...cfg,
      public: toPublicConfig(cfg),
    });
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error("[dev/config PATCH]", err?.message || err);
    res.status(status).json({ error: err?.message || "Failed to update config" });
  }
});

/** อัปโหลดโลโก้แบรนด์ (data URL) → /uploads/branding/... */
devConfigRouter.post("/branding/logo", ...requireAdminDev, async (req, res) => {
  try {
    const dataUrl = req.body?.logoBase64;
    const parsed = parseSafeAvatarDataUrl(dataUrl);
    if (!parsed) {
      res.status(400).json({ error: "logoBase64 ต้องเป็นรูป PNG/JPG/WEBP/GIF ขนาดไม่เกิน 2MB" });
      return;
    }
    const dir = path.join(projectRoot, "uploads", "branding");
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `logo-${Date.now()}.${parsed.ext}`;
    fs.writeFileSync(path.join(dir, fileName), parsed.buffer);
    const logoUrl = `/uploads/branding/${fileName}`;
    const cfg = await updateSystemConfig({ branding: { logoUrl } }, req.user?.id || null);
    const editedAt = cfg?.updatedAt
      ? new Date(cfg.updatedAt).toISOString()
      : new Date().toISOString();
    await logEvent({
      event: "admin_dev.branding.logo.updated",
      actorId: req.user?.id || null,
      targetType: "systemConfig",
      targetId: "default",
      meta: {
        actorRole: "admin_dev",
        actorEmail: req.user?.email || null,
        actorName: req.user?.name || null,
        editedAt,
        logoUrl,
        changedAreas: ["โลโก้"],
        changeSummary: "อัปโหลดโลโก้แบรนด์",
      },
    }).catch(() => null);
    res.json({ logoUrl, branding: cfg.branding });
  } catch (err) {
    console.error("[dev/branding/logo]", err?.message || err);
    res.status(500).json({ error: err?.message || "Failed to upload logo" });
  }
});
