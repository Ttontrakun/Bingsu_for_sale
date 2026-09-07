import express from "express";
import { getSystemConfig, toPublicConfig, toStaffConfig } from "../lib/systemConfig.js";
import {
  COPY_KEYS,
  USER_MENU_CATALOG,
  ADMIN_MENU_CATALOG,
  ADMIN_SYSTEM_TAB_CATALOG,
} from "../lib/featureCatalog.js";
import { authenticate, requireRole } from "../lib/auth.js";

export const configRouter = express.Router();

/** Public product config for User runtime (no admin menu surface). */
configRouter.get("/public", async (_req, res) => {
  try {
    const cfg = await getSystemConfig();
    res.json(toPublicConfig(cfg));
  } catch (err) {
    console.error("[config/public]", err?.message || err);
    res.status(500).json({ error: "Failed to load config" });
  }
});

/** Staff config — รวมเมนูแอดมิน ใช้หลังล็อกอินเท่านั้น */
configRouter.get("/staff", authenticate, requireRole("support", "admin", "admin_metrics", "admin_dev"), async (_req, res) => {
  try {
    const cfg = await getSystemConfig();
    res.json(toStaffConfig(cfg));
  } catch (err) {
    console.error("[config/staff]", err?.message || err);
    res.status(500).json({ error: "Failed to load config" });
  }
});

/** Catalog metadata — จำกัดเฉพาะ staff */
configRouter.get("/catalog", authenticate, requireRole("support", "admin", "admin_metrics", "admin_dev"), (_req, res) => {
  res.json({
    copyKeys: COPY_KEYS,
    userMenus: USER_MENU_CATALOG,
    adminMenus: ADMIN_MENU_CATALOG,
    systemTabs: ADMIN_SYSTEM_TAB_CATALOG,
  });
});
