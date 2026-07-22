// จำลอง flow "ถามหลายคำถาม" เป๊ะๆ: แยกคำถาม → ค้นทีละข้อ → ดูว่าแต่ละข้อได้ chunk อะไร
// ใช้หาสาเหตุว่าทำไมถามรวมแล้วบางข้อตอบ "ไม่พบ" ทั้งที่ถามเดี่ยวเจอ
//
//   docker compose exec -e Q="1. PM เสาคือใคร 2. บริการเสาโทรคมนาคมอ้างอิงคำสั่งเลขที่อะไร 3. Corporate Internet ให้ส่วนลดเกิน Floor Price ใครอนุมัติ" \
//     legacy node server/scripts/debug-multiquestion.js

import { embedTexts } from "../services/embeddings.js";

const url = (process.env.QDRANT_URL || "http://qdrant:6333").replace(/\/+$/, "");
const key = process.env.QDRANT_API_KEY || "";
const coll = process.env.QDRANT_COLLECTION || "documents";
const headers = { "Content-Type": "application/json", ...(key ? { "api-key": key } : {}) };

// ก็อป logic เดียวกับ splitSubQuestions ใน rag.js
const splitSubQuestions = (query) => {
  const text = String(query || "").trim();
  if (!text) return [];
  let parts = text.split(/[?？\n]+|(?:^|\s)\d{1,2}[.)]+\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    parts = text.split(/\s+(?:และก็|แล้วก็|อีกอย่าง|อีกข้อ|อีกคำถาม|รวมถึง|พร้อมทั้ง|และ|กับ)\s+/).map((s) => s.trim()).filter(Boolean);
  }
  parts = parts.filter((p) => p.replace(/\s+/g, "").length >= 6);
  const unique = Array.from(new Set(parts));
  return unique.length >= 2 ? unique.slice(0, 4) : [];
};

const search = async (vector, limit) => {
  const r = await fetch(`${url}/collections/${coll}/points/search`, {
    method: "POST", headers,
    body: JSON.stringify({ vector, limit, with_payload: true }),
  });
  if (!r.ok) throw new Error(`Qdrant ${r.status}: ${await r.text()}`);
  return (await r.json())?.result || [];
};

const main = async () => {
  const query = process.env.Q || "1. PM เสาคือใคร 2. บริการเสาโทรคมนาคมอ้างอิงคำสั่งเลขที่อะไร 3. Corporate Internet ให้ส่วนลดเกิน Floor Price ใครอนุมัติ";
  console.log(`คำถามเต็ม: "${query}"\n`);

  const subs = splitSubQuestions(query);
  if (subs.length < 2) {
    console.log(`❌ แยกคำถามไม่สำเร็จ! ได้ ${subs.length} ข้อ → ระบบจะค้นรวมเป็นก้อนเดียว (นี่คือต้นตอ)`);
    console.log("   parts:", JSON.stringify(subs));
    return;
  }
  console.log(`✅ แยกได้ ${subs.length} คำถาม:`);
  subs.forEach((s, i) => console.log(`   ข้อ ${i + 1}: ${s}`));

  for (const [i, sub] of subs.entries()) {
    const [vec] = await embedTexts([sub]);
    const results = await search(vec, 5);
    console.log(`\n── ข้อ ${i + 1}: "${sub}" — Top 5 ที่ค้นได้ ──`);
    results.forEach((p, k) => {
      const fn = p.payload?.fileName || p.payload?.docId || "?";
      const snip = String(p.payload?.text || "").replace(/\s+/g, " ").slice(0, 70);
      console.log(`   ${k + 1}. ${p.score.toFixed(3)} [${fn}]  ${snip}`);
    });
  }
};

main().catch((e) => { console.error("ล้มเหลว:", e?.message || e); process.exit(1); });
