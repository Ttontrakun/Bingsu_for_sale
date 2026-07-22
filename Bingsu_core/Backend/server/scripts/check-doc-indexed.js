// เช็คว่าเอกสารถูก index ใน Qdrant หรือยัง + ลิสต์ไฟล์ทั้งหมดที่อยู่ในฐาน
// ใช้ตอนสงสัยว่า "AI หาเอกสารไม่เจอ" เพราะยังไม่ได้อัป/ยังไม่ได้ index
//
// รันในคอนเทนเนอร์ legacy:
//   docker compose exec legacy node server/scripts/check-doc-indexed.js
// หรือค้นคำเฉพาะ:
//   docker compose exec -e FIND="เสาโทรคมนาคม" legacy node server/scripts/check-doc-indexed.js

const url = (process.env.QDRANT_URL || "http://qdrant:6333").replace(/\/+$/, "");
const key = process.env.QDRANT_API_KEY || "";
const coll = process.env.QDRANT_COLLECTION || "documents";
const find = process.env.FIND || "เสาโทรคมนาคม|รบ\\.?\\s?7/2569|Tower";
const findRe = new RegExp(find, "i");

const headers = { "Content-Type": "application/json", ...(key ? { "api-key": key } : {}) };

const main = async () => {
  let offset = null;
  let total = 0;
  const files = new Map();
  const hits = [];

  for (;;) {
    const body = { limit: 500, with_payload: true, with_vector: false, ...(offset ? { offset } : {}) };
    const r = await fetch(`${url}/collections/${coll}/points/scroll`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.error(`Qdrant error ${r.status}: ${await r.text()}`);
      process.exit(1);
    }
    const j = await r.json();
    const pts = j?.result?.points || [];
    for (const p of pts) {
      total += 1;
      const fn = p.payload?.fileName || p.payload?.docId || "(unknown)";
      files.set(fn, (files.get(fn) || 0) + 1);
      const text = String(p.payload?.text || "");
      if (findRe.test(text) || findRe.test(fn)) hits.push(fn);
    }
    offset = j?.result?.next_page_offset;
    if (!offset) break;
  }

  console.log(`collection: ${coll} | รวม chunk ทั้งหมด: ${total}`);
  console.log("\n=== ไฟล์ที่ index อยู่ในระบบ (จำนวน chunk : ชื่อไฟล์) ===");
  for (const [f, c] of [...files.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(c).padStart(4)}  ${f}`);
  }

  console.log(`\n=== chunk ที่ตรงกับ "${find}" ===`);
  if (!hits.length) {
    console.log("  ❌ ไม่พบเลย — เอกสารนี้ยังไม่ถูก index (ต้องอัปโหลดเข้าระบบก่อน)");
  } else {
    const uniq = [...new Set(hits)];
    console.log(`  ✅ พบ ${hits.length} chunk จาก ${uniq.length} ไฟล์:`);
    uniq.forEach((f) => console.log("   - " + f));
  }
};

main().catch((e) => {
  console.error("ล้มเหลว:", e?.message || e);
  process.exit(1);
});
