/**
 * Multer มักอ่าน originalname เป็น latin1 ทั้งที่เบราว์เซอร์ส่ง UTF-8
 * ทำให้ชื่อไทยกลายเป็น mojibake เช่น à¸¡à¸•...
 */
export const decodeUploadFileName = (name, fallback = "file") => {
  const raw = String(name || "").trim();
  if (!raw) return fallback;
  if (/[\u0E00-\u0E7F]/.test(raw)) return raw;

  const looksMojibake = /à[¸¹]|Ã.|Ä.|Å.|Â./.test(raw);
  if (!looksMojibake) return raw;

  try {
    const fixed = Buffer.from(raw, "latin1").toString("utf8");
    if (fixed && !fixed.includes("\uFFFD") && (/[\u0E00-\u0E7F]/.test(fixed) || fixed.length <= raw.length)) {
      return fixed;
    }
  } catch {
    /* keep raw */
  }
  return raw;
};

/** ใช้ตอนแสดงชื่อที่อาจถูกเก็บแบบ mojibake ไว้แล้ว */
export const repairStoredFileName = (name, fallback = "file") => decodeUploadFileName(name, fallback);
