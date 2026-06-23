const EMAIL_RE = /\b([a-zA-Z0-9._%+-]{1,64})@([a-zA-Z0-9.-]{1,253}\.[A-Za-z]{2,24})\b/g;
const PHONE_RE = /(?:\+?66|0)[0-9][0-9\-\s]{7,12}[0-9]/g;
const THAI_ID_RE = /\b\d{1,3}[-\s]?\d{1,4}[-\s]?\d{1,5}[-\s]?\d{1,2}[-\s]?\d\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const NAME_HINT_RE = /\b(?:นาย|นางสาว|นาง|คุณ|Mr\.?|Mrs\.?|Ms\.?)\s+[A-Za-zก-๙][A-Za-zก-๙\s]{1,60}/g;

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

export const maskEmail = (value) => {
  const text = String(value || "");
  const match = text.match(/^([^@]+)@(.+)$/);
  if (!match) return text;
  const local = match[1];
  const domain = match[2];
  if (local.length <= 2) return `${"*".repeat(Math.max(1, local.length))}@${domain}`;
  return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`;
};

export const maskIp = (value) => {
  const text = String(value || "").trim();
  if (!text) return text;
  if (text.includes(".")) {
    const chunks = text.split(".");
    if (chunks.length === 4) return `${chunks[0]}.${chunks[1]}.***.***`;
  }
  if (text.includes(":")) {
    const chunks = text.split(":").filter(Boolean);
    if (chunks.length >= 2) return `${chunks[0]}:${chunks[1]}:****:****`;
  }
  return "***";
};

export const redactSensitiveText = (input) => {
  let text = String(input || "");
  text = text.replace(EMAIL_RE, (full) => maskEmail(full));
  text = text.replace(PHONE_RE, () => "[REDACTED_PHONE]");
  text = text.replace(THAI_ID_RE, (full) => {
    const digits = onlyDigits(full);
    return digits.length >= 4 ? `${digits.slice(0, 2)}*********${digits.slice(-2)}` : "[REDACTED_THAI_ID]";
  });
  text = text.replace(NAME_HINT_RE, "[REDACTED_NAME]");
  return text;
};

const maskNestedMeta = (meta = {}) => {
  const out = { ...meta };
  if (typeof out.email === "string") out.email = maskEmail(out.email);
  if (typeof out.ip === "string") out.ip = maskIp(out.ip);
  if (typeof out.forwardedFor === "string") out.forwardedFor = maskIp(out.forwardedFor);
  if (typeof out.reason === "string") out.reason = redactSensitiveText(out.reason);
  return out;
};

export const maskLogForExport = (log) => {
  if (!log || typeof log !== "object") return log;
  return {
    ...log,
    user: log.user
      ? {
          ...log.user,
          email: maskEmail(log.user.email),
        }
      : log.user,
    meta: maskNestedMeta(log.meta),
  };
};
