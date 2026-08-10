/** Validate avatar URL / data-URI uploads (no SVG, no arbitrary remote overwrite). */

const ALLOWED_DATA_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function parseSafeAvatarDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
  const match = dataUrl.match(/^data:image\/(\w+);base64,([\s\S]+)$/);
  if (!match) return null;
  let ext = match[1].toLowerCase();
  if (ext === "jpeg") ext = "jpg";
  if (!ALLOWED_DATA_EXTS.has(ext) || ext === "svg") return null;
  const base64Data = match[2].replace(/\s/g, "");
  let buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    return null;
  }
  if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) return null;
  return { ext: ext === "jpeg" ? "jpg" : ext, buffer };
}

/** Allow preset keys or local upload paths only — reject external http(s) and data: URLs. */
export function sanitizeAvatarUrlString(value) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("preset:")) return trimmed.slice(0, 64);
  if (/^\/uploads\/(avatars|bot-avatars|branding)\/[A-Za-z0-9._-]+$/i.test(trimmed)) return trimmed;
  return undefined; // reject
}
