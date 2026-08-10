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
    const cfg = await updateSystemConfig(patch, req.user?.id || null);
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
    res.json({ logoUrl, branding: cfg.branding });
  } catch (err) {
    console.error("[dev/branding/logo]", err?.message || err);
    res.status(500).json({ error: err?.message || "Failed to upload logo" });
  }
});
