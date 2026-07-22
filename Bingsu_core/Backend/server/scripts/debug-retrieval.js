// ดีบัก retrieval: ถามคำถาม แล้วดูว่า "ค้นทั้งฐาน (ไม่กรอง Knowledge)" ได้ chunk ไหนขึ้นอันดับต้น
// ช่วยแยกว่า AI ตอบผิดเพราะ (ก) เอกสารถูกกรองออกจากชุด Knowledge ของแชท หรือ (ข) embedding จัดอันดับผิดเอง
//
// รันในคอนเทนเนอร์ legacy:
//   docker compose exec -e Q="บริการเสาโทรคมนาคมอ้างอิงคำสั่งเลขที่อะไร" legacy node server/scripts/debug-retrieval.js

import { embedTexts } from "../services/embeddings.js";

const url = (process.env.QDRANT_URL || "http://qdrant:6333").replace(/\/+$/, "");
const key = process.env.QDRANT_API_KEY || "";
const coll = process.env.QDRANT_COLLECTION || "documents";
const query = process.env.Q || "บริการเสาโทรคมนาคมอ้างอิงคำสั่งเลขที่อะไร";
const headers = { "Content-Type": "application/json", ...(key ? { "api-key": key } : {}) };

const main = async () => {
  console.log(`คำถาม: "${query}"\n`);
  const [vector] = await embedTexts([query]);
  if (!Array.isArray(vector) || !vector.length) {
    console.error("embed ไม่สำเร็จ (เช็ค EMBEDDING_* ใน .env)");
    process.exit(1);
  }
  console.log(`embedding มิติ: ${vector.length}`);

  const r = await fetch(`${url}/collections/${coll}/points/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ vector, limit: 12, with_payload: true }),
  });
  if (!r.ok) {
    console.error(`Qdrant error ${r.status}: ${await r.text()}`);
    process.exit(1);
  }
  const j = await r.json();
  const results = j?.result || [];
  console.log(`\n=== Top ${results.length} chunk (ค้นทั้งฐาน ไม่กรอง Knowledge) ===`);
  results.forEach((p, i) => {
    const fn = p.payload?.fileName || p.payload?.docId || "(unknown)";
    const snippet = String(p.payload?.text || "").replace(/\s+/g, " ").slice(0, 90);
    console.log(`${String(i + 1).padStart(2)}. score=${p.score.toFixed(4)}  [${fn}]`);
    console.log(`     ${snippet}`);
  });

  const towerRank = results.findIndex((p) => /เสาโทรคมนาคม|รบ\.?\s?7\/2569|Tower/i.test(String(p.payload?.text || "") + (p.payload?.fileName || "")));
  console.log("\n=== วิเคราะห์ ===");
  if (towerRank < 0) console.log("❌ เอกสารเสาโทรคมนาคมไม่ติด Top 12 เลย = embedding จัดอันดับแพ้ (ปัญหา retrieval/ranking)");
  else console.log(`✅ เอกสารเสาโทรคมนาคมติดอันดับที่ ${towerRank + 1} จากการค้นทั้งฐาน — ถ้า AI ยังไม่เห็น แปลว่าถูก "กรองออกจากชุด Knowledge ของแชท"`);
};

main().catch((e) => {
  console.error("ล้มเหลว:", e?.message || e);
  process.exit(1);
});
