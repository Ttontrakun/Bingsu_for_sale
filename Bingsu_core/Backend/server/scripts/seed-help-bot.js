/**
 * Seed the "คู่มือการใช้งาน" document and "บอทช่วยสอน" bot (owned by admin).
 * Run after seed-admins. Ensures all users can use the help bot via list APIs.
 */
import dotenv from "dotenv";
import { prisma } from "../db.js";
import { qdrantCollectionName } from "../config.js";
import { ensureSourceFileBlocks } from "../services/text.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const HELP_DOC_DISPLAY_NAME = "คู่มือการใช้งาน";
const HELP_BOT_NAME = "บอทช่วยสอน";

const HELP_CONTENT = `
# คู่มือการใช้งานระบบบิงซูบอท (Enterprise AI Chatbot Bot)

## วิธีเริ่มแชทกับบอท
1. ที่หน้าแรก เลือก **Knowledge** (ชุดความรู้) ที่ต้องการถาม จาก dropdown ด้านบน
2. เลือก **Bot** (ถ้ามีหลายตัว) หรือเว้นไว้ก็ได้
3. พิมพ์คำถามในช่องข้อความ แล้วกดส่ง หรือกด Enter
4. ระบบจะสร้างแชทใหม่และพาคุณไปหน้าการสนทนา

## การเลือก Knowledge
- Knowledge คือชุดเอกสาร (ไฟล์) ที่คุณหรือทีมอัปโหลดไว้
- แต่ละชุดมีชื่อแสดงใน dropdown "Select Knowledge"
- เลือกชุดที่เกี่ยวข้องกับเรื่องที่ต้องการถาม เพื่อให้บอทค้นคำตอบจากชุดนั้น

## การสร้างบอท
1. ไปที่เมนู **Bots** จากแถบด้านข้าง
2. กด **สร้างบอท** หรือ **Create Bot**
3. ใส่ชื่อบอท ระบบพรอมต์ (คำสั่งให้บอทปฏิบัติ) และคำอธิบายสั้น ๆ
4. เลือก Knowledge ที่บอทนี้จะใช้ตอบคำถาม
5. บันทึก — บอทจะไปแสดงใน dropdown ที่หน้าแรก

## เคล็ดลับ
- คำอธิบายบอทจะแสดงที่หน้าแรกเมื่อผู้ใช้เลือกบอทนั้น
- ถ้าต้องการความช่วยเหลือเพิ่มเติม เลือก Knowledge "คู่มือการใช้งาน" และบอท "บอทช่วยสอน" แล้วถามได้เลย
`.trim();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.warn("Admin user not found. Run npm run seed:admins first.");
    process.exitCode = 1;
    return;
  }

  let doc = await prisma.document.findFirst({
    where: { displayName: HELP_DOC_DISPLAY_NAME, ownerId: admin.id },
  });

  if (!doc) {
    const sourceFiles = ensureSourceFileBlocks([
      { name: "คู่มือการใช้งาน.txt", text: HELP_CONTENT },
    ]);
    doc = await prisma.document.create({
      data: {
        displayName: HELP_DOC_DISPLAY_NAME,
        ragStoreName: qdrantCollectionName,
        ownerId: admin.id,
        sourceFiles,
      },
    });
    console.log("Created document:", doc.displayName, doc.id);
  } else {
    console.log("Document already exists:", doc.displayName, doc.id);
  }

  let bot = await prisma.bot.findFirst({
    where: { name: HELP_BOT_NAME },
  });

  if (!bot) {
    const helpPrompt = [
      "คุณคือบอทช่วยสอนการใช้งานระบบบิงซูบอท (Enterprise AI Chatbot Bot)",
      "ตอบคำถามวิธีใช้จาก Context และจากความรู้ระบบ (เมนู Bots, Knowledge, หน้าแรก, การแชท) ได้ — อธิบายเป็นภาษาไทยอย่างเป็นมิตร",
      "รองรับคำถามติดตามเช่น ทำยังไง กดตรงไหน อธิบายเพิ่ม ขั้นตอนยังไง — ตอบได้โดยไม่ต้องอิงเฉพาะเนื้อใน Context เสมอไป แต่ไม่ดึงข้อมูลจากภายนอกระบบ",
    ].join("\n");

    bot = await prisma.bot.create({
      data: {
        name: HELP_BOT_NAME,
        prompt: helpPrompt,
        description: "AI ช่วยสอนวิธีใช้งานระบบ — เลือก Knowledge นี้และบอทนี้แล้วถามได้เลย",
        model: null,
        ownerId: admin.id,
        documents: {
          create: [{ documentId: doc.id }],
        },
      },
    });
    console.log("Created bot:", bot.name, bot.id);
  } else {
    const helpPromptNew = [
      "คุณคือบอทช่วยสอนการใช้งานระบบบิงซูบอท (Enterprise AI Chatbot Bot)",
      "ตอบคำถามวิธีใช้จาก Context และจากความรู้ระบบ (เมนู Bots, Knowledge, หน้าแรก, การแชท) ได้ — อธิบายเป็นภาษาไทยอย่างเป็นมิตร",
      "รองรับคำถามติดตามเช่น ทำยังไง กดตรงไหน อธิบายเพิ่ม ขั้นตอนยังไง — ตอบได้โดยไม่ต้องอิงเฉพาะเนื้อใน Context เสมอไป แต่ไม่ดึงข้อมูลจากภายนอกระบบ",
    ].join("\n");
    await prisma.bot.update({
      where: { id: bot.id },
      data: { prompt: helpPromptNew },
    });
    console.log("Updated help bot prompt");
    const link = await prisma.botDocument.findUnique({
      where: { botId_documentId: { botId: bot.id, documentId: doc.id } },
    });
    if (!link) {
      await prisma.botDocument.create({
        data: { botId: bot.id, documentId: doc.id },
      });
      console.log("Linked help bot to help document");
    }
    console.log("Bot already exists:", bot.name, bot.id);
  }

  console.log("Done. Help document ID:", doc.id, "| Help bot ID:", bot.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
