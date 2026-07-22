const EMAIL_RE = /\b([a-zA-Z0-9._%+-]{1,64})@([a-zA-Z0-9.-]{1,253}\.[A-Za-z]{2,24})\b/g;
const PHONE_RE = /(?:\+?66|0)[0-9][0-9\-\s]{7,12}[0-9]/g;
// บัตรประชาชนไทยมี 13 หลักเสมอ (รูปแบบ X-XXXX-XXXXX-XX-X หรือ 13 หลักติดกัน)
// ระบุ 13 หลักเป๊ะ เพื่อไม่ให้ไปจับตัวเลขราคา/ค่าเงิน (5-7 หลัก) โดยไม่ตั้งใจ
const THAI_ID_RE = /\b\d[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d\b/g;
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

/**
 * ตรวจว่าข้อความของผู้ใช้มีข้อมูลส่วนบุคคลไหม (เลขบัตรประชาชน / เบอร์โทร / ที่อยู่)
 * ใช้เพื่อ "แจ้งเตือน" ผู้ใช้ ไม่ให้กรอกข้อมูลส่วนตัวลงในแชท — คืนชนิดที่พบ (ไทย) หรือ null
 * ใช้ regex ชุดใหม่ (ไม่มี flag g) เพื่อเลี่ยงปัญหา lastIndex ค้างของ regex แบบ global
 */
export const detectPersonalInfoType = (input) => {
  const text = String(input || "");
  // เลขบัตรประชาชนไทย = 13 หลักเป๊ะ (มี/ไม่มีขีดคั่นก็ได้)
  if (/\b\d[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d\b/.test(text)) return "เลขบัตรประชาชน";
  // เบอร์โทรไทย (ขึ้นต้น 0 หรือ +66)
  if (/(?:\+?66|0)\d[\d\s-]{7,12}\d/.test(text)) return "เบอร์โทรศัพท์";
  // ที่อยู่: มีคำบ่งชี้ที่อยู่ตั้งแต่ 2 คำ หรือมี 1 คำ + รหัสไปรษณีย์ 5 หลัก
  const addrHits = (text.match(/บ้านเลขที่|เลขที่|หมู่ที่|หมู่บ้าน|ซอย|ถนน|ตำบล|แขวง|อำเภอ|เขต|จังหวัด|รหัสไปรษณีย์/g) || []).length;
  if (addrHits >= 2 || (addrHits >= 1 && /\b\d{5}\b/.test(text))) return "ที่อยู่";
  return null;
};

/** ข้อความแจ้งเตือนเมื่อผู้ใช้พิมพ์ข้อมูลส่วนตัว — คืน string หรือ null ถ้าไม่พบ */
export const buildPersonalInfoWarning = (input) => {
  const kind = detectPersonalInfoType(input);
  if (!kind) return null;
  return `⚠️ เพื่อความปลอดภัยของคุณ กรุณาอย่าพิมพ์ข้อมูลส่วนตัว เช่น เลขบัตรประชาชน เบอร์โทรศัพท์ หรือที่อยู่ ลงในแชท\n\nระบบตรวจพบว่าข้อความของคุณอาจมี${kind} — หากต้องการสอบถามข้อมูล กรุณาถามใหม่โดยไม่ใส่ข้อมูลส่วนบุคคลนะครับ`;
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
