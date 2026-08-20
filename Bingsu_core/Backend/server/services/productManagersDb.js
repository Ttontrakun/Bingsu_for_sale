/**
 * Structured lookup รายชื่อ Super PM / Product Manager
 * ใช้ตอบ "ใครเป็น PM / Super PM ของบริการนี้"
 */
import { prisma } from "../db.js";
import { normalizeText } from "./chat/queryClassifiers.js";

let entryCache = { data: null, expiresAt: 0 };
const ENTRY_TTL_MS = 60 * 1000;

export const invalidateProductManagerCache = () => {
  entryCache = { data: null, expiresAt: 0 };
};

const loadEntries = async () => {
  if (entryCache.data && Date.now() < entryCache.expiresAt) return entryCache.data;
  try {
    const rows = await prisma.productManagerEntry.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }],
    });
    entryCache = { data: rows, expiresAt: Date.now() + ENTRY_TTL_MS };
    return rows;
  } catch (err) {
    console.warn("[productManagers] loadEntries failed:", err?.message || err);
    return entryCache.data || [];
  }
};

const detectServiceKey = (m) => {
  if (/(nt\s*dark\s*fiber|dark\s*fiber|เส้นใยแก้วนำแสง)/.test(m)) return "dark_fiber";
  if (/\biig\b|อินเตอร์เน็ตเกตเวย์|อินเทอร์เน็ตเกตเวย์/.test(m)) return "iig";
  if (/(carrier\s*ethernet|nt\s*mpls|\bmpls\b|datacom|สื่อสารข้อมูล)/.test(m)) return "carrier_mpls";
  if (/(corporate\s*internet\s*lite|corp\s*lite)/.test(m)) return "corp_lite";
  if (/(nt\s*corporate|corporate\s*internet|connectivity)/.test(m)) return "corporate";
  if (/(private\s*line|nt\s*pl\b)/.test(m)) return "private_line";
  if (/(sip\s*trunk)/.test(m)) return "sip_trunk";
  if (/(cloud\s*pbx|mobile\s*pbx|v-?pbx)/.test(m)) return "cloud_pbx";
  if (/(contact\s*center)/.test(m)) return "contact_center";
  if (/(data\s*center|\bix\b|ศูนย์ข้อมูล)/.test(m)) return "data_center";
  if (/(cloud|big\s*data|คลาวด์|บิ๊กดาต้า)/.test(m)) return "cloud_bigdata";
  if (/(cybersecurity|ความปลอดภัยไซเบอร์|cctv)/.test(m)) return "cybersecurity";
  if (/(satellite|ดาวเทียม)/.test(m)) return "satellite";
  if (/(5g\s*solution|\b5g\b)/.test(m)) return "mobile_5g";
  if (/(trunk\s*radio)/.test(m)) return "trunk_radio";
  if (/(mobile\s*retail)/.test(m)) return "mobile_retail";
  if (/(internet\s*retail)/.test(m)) return "internet_retail";
  if (/(fixed\s*line|โทรศัพท์พื้นฐาน)/.test(m)) return "fixed_line";
  if (/\bidd\b/.test(m)) return "idd";
  if (/(ท่อร้อยสาย|neutral\s*last\s*mile)/.test(m)) return "duct_nlm";
  if (/(เสาโทรคมนาคม|\btower\b)/.test(m)) return "tower";
  if (/(พัฒนาสินทรัพย์|asset)/.test(m)) return "asset_dev";
  return null;
};

const isPmDirectoryQuery = (m) => {
  // กันคำถามเพดานส่วนลด/อำนาจของตำแหน่ง (เช่น "ผจก.ฝ่าย ให้ส่วนลดได้ไม่เกินกี่ %")
  // ไม่ใช่คำถามหารายชื่อ PM
  const asksDiscountCeiling =
    /(ส่วนลด)/.test(m)
    && /(ไม่เกิน|ได้ไม่เกิน|สูงสุด|กี่\s*%|กี่%|เปอร์เซ็นต์|%)/.test(m);
  if (asksDiscountCeiling) return false;
  if (/(ใครอนุมัติ|ผู้อนุมัติ|อำนาจอนุมัติ|ใช้อำนาจระดับ)/.test(m)) return false;

  return /(super\s*pm|super\s*product\s*manager|product\s*manager|\bpm\b|ใครเป็น\s*(pm|super)|pm\s*(ของ|คือ)|super\s*pm\s*(ของ|คือ)|รายชื่อ\s*(pm|super)|ใคร(?:เป็น|ดูแล|รับผิดชอบ).{0,20}(pm|product\s*manager)|(?:ผจก\.|ชจญ\.).{0,12}(?:ของบริการ|ของ\s*nt|ดูแล|รับผิดชอบ|คือใคร|ชื่อ))/i.test(m);
};

const wantsSuperPm = (m) =>
  /(super\s*pm|super\s*product\s*manager|ชจญ\.|ผู้ช่วยกรรมการ)/i.test(m)
  && !/(product\s*manager(?!\s*และ)|ผจก\.|\bpm\b)/i.test(m);

const wantsBoth = (m) =>
  /(super\s*pm.*\bpm\b|\bpm\b.*super|ทั้งคู่|และ\s*pm)/i.test(m)
  || (!/(super\s*pm|product\s*manager|\bpm\b)/i.test(m) && /(ใครดูแล|ผู้รับผิดชอบ)/.test(m));

const matchByText = (entries, m) => {
  const scored = entries.map((e) => {
    const blob = normalizeText([e.serviceGroup, e.businessGroup, e.serviceKey].filter(Boolean).join(" "));
    let score = 0;
    const tokens = String(e.serviceGroup || "")
      .replace(/^\d+(\.\d+)?\s*/g, "")
      .split(/[,/()]+/)
      .map((t) => normalizeText(t).trim())
      .filter((t) => t.length >= 4);
    for (const t of tokens) {
      if (m.includes(t)) score += t.length;
    }
    if (e.serviceKey && m.includes(normalizeText(e.serviceKey.replace(/_/g, " ")))) score += 20;
    return { e, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.e || null;
};

const formatEntry = (entry, { focus } = {}) => {
  const lines = [`บริการ: ${entry.serviceGroup}`];
  if (entry.businessGroup) lines.push(`กลุ่มธุรกิจ: ${entry.businessGroup}`);
  const showSuper = focus !== "pm";
  const showPm = focus !== "super";
  if (showSuper) {
    const spm = [entry.superPmAbbr, entry.superPmTitle, entry.superPmName].filter(Boolean).join(" — ");
    lines.push(`Super Product Manager: ${spm || "-"}`);
  }
  if (showPm) {
    const pm = [entry.pmAbbr, entry.pmTitle, entry.pmName].filter(Boolean).join(" — ");
    lines.push(`Product Manager: ${pm || "-"}`);
  }
  return lines.join("\n");
};

/**
 * ตอบจากรายชื่อ Super PM / PM — คืน string หรือ null
 */
export async function getProductManagerReply(message) {
  const raw = String(message || "").trim();
  if (!raw) return null;
  const m = normalizeText(raw);
  if (!isPmDirectoryQuery(m)) return null;

  const entries = await loadEntries();
  if (!entries.length) return null;

  const serviceKey = detectServiceKey(m);
  let entry = null;
  if (serviceKey) {
    entry = entries.find((e) => e.serviceKey === serviceKey) || null;
  }
  if (!entry) entry = matchByText(entries, m);
  if (!entry) {
    return "ระบุชื่อบริการให้ชัด เช่น Dark Fiber, IIG, Data Center จะหา Super PM / Product Manager ให้ได้";
  }

  if (wantsBoth(m)) return formatEntry(entry, { focus: "both" });
  if (wantsSuperPm(m)) return formatEntry(entry, { focus: "super" });
  return formatEntry(entry, { focus: "pm" });
}
