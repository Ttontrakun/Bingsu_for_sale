// ลิสต์ชุด Knowledge (Document) ทั้งหมด + ไฟล์ในแต่ละชุด
// ใช้ดูว่าเอกสารแต่ละไฟล์อยู่ในชุด Knowledge ไหน (แก้ปัญหา "อัปแล้วแต่แชทหาไม่เจอ")
//
// รันในคอนเทนเนอร์ legacy:
//   docker compose exec legacy node server/scripts/list-knowledge.js
// ค้นเฉพาะชุดที่มีคำในชื่อไฟล์:
//   docker compose exec -e FIND="เสา" legacy node server/scripts/list-knowledge.js

import { prisma } from "../db.js";

const find = (process.env.FIND || "").trim();

const main = async () => {
  const docs = await prisma.document.findMany({
    select: { id: true, displayName: true, sourceFiles: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  console.log(`มีชุด Knowledge ทั้งหมด: ${docs.length} ชุด\n`);
  for (const d of docs) {
    const files = Array.isArray(d.sourceFiles)
      ? d.sourceFiles.map((f) => (typeof f === "string" ? f : f?.name)).filter(Boolean)
      : [];
    if (find && !files.some((f) => f.includes(find)) && !String(d.displayName).includes(find)) continue;
    console.log(`📚 Knowledge: "${d.displayName}"  (id=${d.id})`);
    if (!files.length) console.log("     (ไม่มีไฟล์)");
    files.forEach((f) => {
      const mark = find && f.includes(find) ? "  ⬅️ ตรงกับที่ค้น" : "";
      console.log(`     - ${f}${mark}`);
    });
    console.log("");
  }

  console.log("วิธีใช้: หา Knowledge ที่มีเอกสารเสาโทรคมนาคม แล้วตอนเปิดแชทให้เลือก Knowledge ชุดนั้น");
};

main()
  .catch((e) => {
    console.error("ล้มเหลว:", e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
