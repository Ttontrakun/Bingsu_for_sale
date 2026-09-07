import { prisma } from "../db.js";
import {
  DEFAULT_SYSTEM_CONFIG,
  DEFAULT_FEATURES,
  DEFAULT_MENUS,
  DEFAULT_COPY,
  DEFAULT_BRANDING,
  USER_MENU_CATALOG,
  ADMIN_SYSTEM_TAB_CATALOG,
} from "./featureCatalog.js";

const CONFIG_ID = "default";

function asObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return { ...fallback };
}

function asMenuList(value, fallback) {
  if (!Array.isArray(value)) return fallback.map((m) => ({ ...m }));
  const byId = new Map();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").trim();
    if (!id) continue;
    byId.set(id, { id, enabled: item.enabled !== false });
  }
  const ordered = [];
  const seen = new Set();
  for (const base of fallback) {
    const hit = byId.get(base.id);
    ordered.push(hit || { id: base.id, enabled: base.enabled !== false });
    seen.add(base.id);
  }
  for (const [id, item] of byId) {
    if (!seen.has(id)) ordered.push(item);
  }
  return ordered;
}

function sanitizeHexColor(value, allowEmpty = true) {
  if (value == null || value === "") return allowEmpty ? "" : null;
  const s = String(value).trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
  if (/^(transparent|inherit|currentColor)$/i.test(s)) return s.toLowerCase();
  return null;
}

function sanitizeTextStyle(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  const color = sanitizeHexColor(input.color, true);
  if (color !== null && color !== "") out.color = color;
  const bg = sanitizeHexColor(input.backgroundColor ?? input.background, true);
  if (bg !== null && bg !== "") out.backgroundColor = bg;
  const size = Number(input.fontSize);
  if (Number.isFinite(size) && size >= 10 && size <= 72) out.fontSize = Math.round(size);
  if (input.bold === true || input.fontWeight === "bold" || input.fontWeight === 700) out.bold = true;
  if (input.bold === false) out.bold = false;
  if (input.italic === true || input.fontStyle === "italic") out.italic = true;
  if (input.italic === false) out.italic = false;
  if (input.underline === true) out.underline = true;
  if (input.underline === false) out.underline = false;
  return out;
}

function normalizeStyles(raw) {
  const src = asObject(raw, {});
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (!key || typeof key !== "string") continue;
    const cleaned = sanitizeTextStyle(value);
    if (Object.keys(cleaned).length) out[key] = cleaned;
  }
  return out;
}

export function normalizeSystemConfig(row) {
  const features = { ...DEFAULT_FEATURES, ...asObject(row?.features, DEFAULT_FEATURES) };
  const menusRaw = asObject(row?.menus, DEFAULT_MENUS);
  const menus = {
    admin: asMenuList(menusRaw.admin, DEFAULT_MENUS.admin),
    user: asMenuList(menusRaw.user, DEFAULT_MENUS.user),
    systemTabs: asMenuList(menusRaw.systemTabs, DEFAULT_MENUS.systemTabs),
  };
  const copy = { ...DEFAULT_COPY, ...asObject(row?.copy, DEFAULT_COPY) };
  const branding = { ...DEFAULT_BRANDING, ...asObject(row?.branding, DEFAULT_BRANDING) };
  const styles = normalizeStyles(row?.styles);

  for (const menu of USER_MENU_CATALOG) {
    if (!menu.feature) continue;
    const entry = menus.user.find((m) => m.id === menu.id);
    if (entry) features[menu.feature] = entry.enabled === true;
  }
  for (const tab of ADMIN_SYSTEM_TAB_CATALOG) {
    if (!tab.feature) continue;
    const entry = menus.systemTabs.find((m) => m.id === tab.id);
    if (entry) features[tab.feature] = entry.enabled === true;
  }

  return {
    id: row?.id || CONFIG_ID,
    packageId: String(row?.packageId || DEFAULT_SYSTEM_CONFIG.packageId),
    features,
    menus,
    copy,
    styles,
    branding,
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
  };
}

export async function ensureSystemConfig() {
  const existing = await prisma.systemConfig.findUnique({ where: { id: CONFIG_ID } });
  if (existing) return normalizeSystemConfig(existing);
  const created = await prisma.systemConfig.create({
    data: {
      id: CONFIG_ID,
      packageId: DEFAULT_SYSTEM_CONFIG.packageId,
      features: DEFAULT_FEATURES,
      menus: DEFAULT_MENUS,
      copy: DEFAULT_COPY,
      styles: {},
      branding: DEFAULT_BRANDING,
    },
  });
  return normalizeSystemConfig(created);
}

export async function getSystemConfig() {
  return ensureSystemConfig();
}

export async function isFeatureEnabled(featureKey) {
  const cfg = await getSystemConfig();
  return cfg.features?.[featureKey] === true;
}

export async function isUserMenuEnabled(menuId) {
  const cfg = await getSystemConfig();
  const entry = (cfg.menus?.user || []).find((m) => m.id === menuId);
  return entry?.enabled === true;
}

export async function updateSystemConfig(patch = {}, updatedBy = null) {
  const current = await ensureSystemConfig();
  const nextFeatures = {
    ...current.features,
    ...(patch.features && typeof patch.features === "object" ? patch.features : {}),
  };
  const nextMenus = {
    admin: asMenuList(
      patch.menus?.admin !== undefined ? patch.menus.admin : current.menus.admin,
      DEFAULT_MENUS.admin,
    ),
    user: asMenuList(
      patch.menus?.user !== undefined ? patch.menus.user : current.menus.user,
      DEFAULT_MENUS.user,
    ),
    systemTabs: asMenuList(
      patch.menus?.systemTabs !== undefined
        ? patch.menus.systemTabs
        : current.menus.systemTabs,
      DEFAULT_MENUS.systemTabs,
    ),
  };

  if (patch.menus?.user !== undefined) {
    for (const menu of USER_MENU_CATALOG) {
      if (!menu.feature) continue;
      const entry = nextMenus.user.find((m) => m.id === menu.id);
      if (entry) nextFeatures[menu.feature] = entry.enabled === true;
    }
  }
  if (patch.menus?.systemTabs !== undefined) {
    for (const tab of ADMIN_SYSTEM_TAB_CATALOG) {
      if (!tab.feature) continue;
      const entry = nextMenus.systemTabs.find((m) => m.id === tab.id);
      if (entry) nextFeatures[tab.feature] = entry.enabled === true;
    }
  }
  if (patch.features && patch.menus?.user === undefined) {
    for (const menu of USER_MENU_CATALOG) {
      if (!menu.feature || patch.features[menu.feature] === undefined) continue;
      const entry = nextMenus.user.find((m) => m.id === menu.id);
      if (entry) entry.enabled = patch.features[menu.feature] === true;
    }
  }
  if (patch.features && patch.menus?.systemTabs === undefined) {
    for (const tab of ADMIN_SYSTEM_TAB_CATALOG) {
      if (!tab.feature || patch.features[tab.feature] === undefined) continue;
      const entry = nextMenus.systemTabs.find((m) => m.id === tab.id);
      if (entry) entry.enabled = patch.features[tab.feature] === true;
    }
  }

  const nextCopy = { ...current.copy };
  if (patch.copy && typeof patch.copy === "object") {
    for (const [key, value] of Object.entries(patch.copy)) {
      if (!key || typeof key !== "string") continue;
      if (value == null) {
        delete nextCopy[key];
        continue;
      }
      nextCopy[key] = String(value).slice(0, 2000);
    }
  }
  const nextBranding = {
    ...current.branding,
    ...(patch.branding && typeof patch.branding === "object" ? patch.branding : {}),
  };

  let nextStyles = { ...current.styles };
  if (patch.styles && typeof patch.styles === "object") {
    for (const [key, value] of Object.entries(patch.styles)) {
      if (value == null) {
        delete nextStyles[key];
        continue;
      }
      const cleaned = sanitizeTextStyle(value);
      if (Object.keys(cleaned).length === 0) delete nextStyles[key];
      else nextStyles[key] = cleaned;
    }
  }

  if (patch.branding && Object.prototype.hasOwnProperty.call(patch.branding, "logoUrl")) {
    const logo = patch.branding.logoUrl;
    if (logo != null && logo !== "") {
      const ok =
        typeof logo === "string" &&
        /^\/uploads\/branding\/[A-Za-z0-9._-]+$/i.test(logo.trim());
      if (!ok) {
        const err = new Error("logoUrl ต้องเป็น path ใน /uploads/branding/ เท่านั้น");
        err.status = 400;
        throw err;
      }
      nextBranding.logoUrl = logo.trim();
    } else {
      nextBranding.logoUrl = null;
    }
  }

  if (typeof nextBranding.appName === "string") {
    nextBranding.appName = nextBranding.appName.trim().slice(0, 80) || DEFAULT_BRANDING.appName;
  }

  const packageId =
    typeof patch.packageId === "string" && patch.packageId.trim()
      ? patch.packageId.trim().slice(0, 64)
      : current.packageId;

  const saved = await prisma.systemConfig.update({
    where: { id: CONFIG_ID },
    data: {
      packageId,
      features: nextFeatures,
      menus: nextMenus,
      copy: nextCopy,
      styles: nextStyles,
      branding: nextBranding,
      updatedBy: updatedBy || null,
    },
  });
  return normalizeSystemConfig(saved);
}

export function toPublicConfig(cfg) {
  return {
    packageId: cfg.packageId,
    features: cfg.features,
    menus: {
      user: cfg.menus.user,
    },
    copy: cfg.copy,
    styles: cfg.styles || {},
    branding: cfg.branding,
    updatedAt: cfg.updatedAt,
  };
}

export function toStaffConfig(cfg) {
  return {
    packageId: cfg.packageId,
    features: cfg.features,
    menus: {
      user: cfg.menus.user,
      admin: cfg.menus.admin,
      systemTabs: cfg.menus.systemTabs,
    },
    copy: cfg.copy,
    styles: cfg.styles || {},
    branding: cfg.branding,
    updatedAt: cfg.updatedAt,
  };
}

/** Convert stored style map entry to React/CSS style object */
export function textStyleToCss(style) {
  if (!style || typeof style !== "object") return {};
  const css = {};
  if (style.color) css.color = style.color;
  if (style.backgroundColor) css.backgroundColor = style.backgroundColor;
  if (style.fontSize) css.fontSize = `${style.fontSize}px`;
  if (style.bold === true) css.fontWeight = 700;
  if (style.italic === true) css.fontStyle = "italic";
  if (style.underline === true) css.textDecoration = "underline";
  return css;
}
