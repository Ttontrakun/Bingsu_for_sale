import express from "express";
import { getSystemConfig, toPublicConfig } from "../lib/systemConfig.js";
import {
  COPY_KEYS,
  USER_MENU_CATALOG,
  ADMIN_MENU_CATALOG,
  ADMIN_SYSTEM_TAB_CATALOG,
} from "../lib/featureCatalog.js";

export const configRouter = express.Router();

/** Public product config for User/Supportadmin runtime (no auth). */
configRouter.get("/public", async (_req, res) => {
  try {
    const cfg = await getSystemConfig();
    res.json(toPublicConfig(cfg));
  } catch (err) {
    console.error("[config/public]", err?.message || err);
    res.status(500).json({ error: "Failed to load config" });
  }
});

/** Catalog metadata (edit keys / menus) — public read for Dev Studio + runtime helpers. */
configRouter.get("/catalog", (_req, res) => {
  res.json({
    copyKeys: COPY_KEYS,
    userMenus: USER_MENU_CATALOG,
    adminMenus: ADMIN_MENU_CATALOG,
    systemTabs: ADMIN_SYSTEM_TAB_CATALOG,
  });
});
