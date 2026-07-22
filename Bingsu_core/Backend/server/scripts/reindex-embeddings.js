// Re-index embeddings ทั้งระบบ — ใช้เมื่อ "เปลี่ยนโมเดล embedding" (เช่น text-embedding-3-small → Qwen3-Embedding-4B)
//
// ทำอะไร:
//   1) ลบ Qdrant collection เดิม (มิติเวกเตอร์เก่า)
//   2) วนอ่านทุกเอกสารจาก DB แล้ว embed ใหม่จาก text/blocks ที่เก็บไว้ (ไม่ต้องอัปโหลด/OCR ซ้ำ)
//   3) ระบบสร้าง collection ใหม่ตามมิติของโมเดลใหม่อัตโนมัติ
//
// วิธีใช้ (รันในคอนเทนเนอร์ legacy):
//   ดูรายการก่อน (ไม่แตะข้อมูล):
//     docker compose exec legacy node server/scripts/reindex-embeddings.js --dry-run
//   รันจริง:
//     docker compose exec legacy node server/scripts/reindex-embeddings.js
//
// ⚠️ ตั้งค่า EMBEDDING_MODEL/BASE_URL/API_KEY ใน .env ให้ถูก + ทดสอบว่า gateway ตอบได้ก่อนรันจริง
//    ถ้าโมเดล/คีย์ผิด จะ embed ไม่ผ่านทุกเอกสาร

import { prisma } from "../db.js";
import { indexDocumentChunks } from "../services/qdrant.js";
import { ensureSourceFileBlocks } from "../services/text.js";
import { qdrantCollectionName, embeddingModel } from "../config.js";

const QDRANT_URL = (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/+$/, "");
const dryRun = process.argv.includes("--dry-run");

const dropCollection = async () => {
  const res = await fetch(`${QDRANT_URL}/collections/${qdrantCollectionName}`, { method: "DELETE" });
  // 200 = ลบสำเร็จ, 404 = ไม่มีอยู่แล้ว (ถือว่าโอเค)
  console.log(`🗑️  ลบ collection "${qdrantCollectionName}" → HTTP ${res.status}`);
};

const main = async () => {
  const docs = await prisma.document.findMany({
    select: { id: true, displayName: true, ownerId: true, sourceFiles: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nโมเดล embedding ปัจจุบัน: ${embeddingModel}`);
  console.log(`พบเอกสารทั้งหมด: ${docs.length} รายการ\n`);

  if (dryRun) {
    console.log("[dry-run] จะ re-index เอกสารเหล่านี้ (ยังไม่แตะข้อมูลจริง):");
    docs.forEach((d, i) => {
      const files = Array.isArray(d.sourceFiles) ? d.sourceFiles.length : 0;
      console.log(`  ${i + 1}. ${d.displayName}  (${files} ไฟล์, id=${d.id})`);
    });
    console.log("\nรันจริงด้วยคำสั่งเดิมแต่เอา --dry-run ออก");
    return;
  }

  // ลบ collection เก่าก่อน แล้วให้ระบบสร้างใหม่ตามมิติโมเดลใหม่ตอน embed ครั้งแรก
  await dropCollection();

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, doc] of docs.entries()) {
    const label = `[${i + 1}/${docs.length}] ${doc.displayName}`;
    const sourceFiles = ensureSourceFileBlocks(Array.isArray(doc.sourceFiles) ? doc.sourceFiles : []);
    const hasBlocks = sourceFiles.some((f) => Array.isArray(f?.blocks) && f.blocks.length);
    if (!hasBlocks) {
      skipped += 1;
      console.warn(`  ⏭️  ข้าม ${label} — ไม่มี text/blocks ให้ embed`);
      continue;
    }
    try {
      await indexDocumentChunks({ documentId: doc.id, userId: doc.ownerId, sourceFiles });
      ok += 1;
      console.log(`  ✅ ${label}`);
    } catch (err) {
      failed += 1;
      console.error(`  ❌ ${label} → ${err?.message || err}`);
    }
  }

  console.log(`\n=== เสร็จสิ้น ===`);
  console.log(`  สำเร็จ:   ${ok}`);
  console.log(`  ข้าม:     ${skipped}`);
  console.log(`  ล้มเหลว:  ${failed}`);
  if (failed > 0) {
    console.log(`\n⚠️ มีเอกสาร embed ไม่ผ่าน — เช็คว่า EMBEDDING_MODEL/BASE_URL/API_KEY ถูกและ gateway ตอบได้`);
  }
};

main()
  .catch((err) => {
    console.error("re-index ล้มเหลว:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
