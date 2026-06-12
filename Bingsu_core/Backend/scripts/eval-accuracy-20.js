import { prisma } from "../server/db.js";
import { getChatReplyForLine } from "../server/routes/conversations.js";

const CASES = [
  ["Q001", "ข้อมูลนี้อัปเดตตอนไหน", "ตอบตามวันที่ที่ระบุในเอกสารเท่านั้น; ถ้าไม่พบวันที่ให้ตอบว่าไม่พบข้อมูลวันที่อัปเดต"],
  ["Q002", "ข้อ 1.1 กรณีไม่เกิน 30 วัน ใครมีอำนาจอนุมัติ", "ผู้บริหารส่วนงานที่มีหน้าที่รับผิดชอบงานขายหรือให้บริการ ตั้งแต่ระดับส่วนหรือเทียบเท่าขึ้นไป"],
  ["Q003", "ข้อ 3.1 ส่วนลดไม่เกิน 50% ของ Price List ใครอนุมัติ", "ผู้ช่วยกรรมการผู้จัดการใหญ่ที่มีหน้าที่ความรับผิดชอบเกี่ยวกับการขายหรือให้บริการ"],
  ["Q004", "ใครรับผิดชอบและใครอนุมัติ (ไม่ระบุข้อ)", "ควรถามกลับเพื่อขอเงื่อนไข/ข้อให้ชัดเจนก่อนสรุปผู้อนุมัติ"],
  ["Q005", "ถ้าเอกสารไม่ได้ระบุชื่อบุคคล ต้องตอบชื่อคนไหม", "ไม่ควรเดาชื่อบุคคล ให้ตอบเฉพาะตำแหน่งตามเอกสาร"],
  ["Q006", "ข้อ 1.1 กับ 3.1 ต่างกันที่ตำแหน่งอนุมัติอย่างไร", "ต้องเปรียบเทียบตำแหน่งอนุมัติของทั้งสองข้อให้ถูกต้องตามข้อความเอกสาร"],
  ["Q007", "ยกข้อความสำคัญของข้อ 1.1 ที่บอกเกณฑ์ระยะเวลา", "ต้องอ้างข้อความข้อ 1.1 ที่เกี่ยวกับเงื่อนไขไม่เกิน 30 วันอย่างถูกต้อง"],
  ["Q008", "คำถามนี้ต้องใช้ข้อมูลจากเอกสารไหน", "ต้องชี้เอกสาร/ตารางที่เกี่ยวข้องกับอำนาจอนุมัติและไม่อ้างข้อมูลนอกเอกสาร"],
  ["Q009", "ถ้าไม่มีข้อมูลตรงคำถามใน grounding chunks ควรตอบอย่างไร", "ต้องระบุว่าไม่พบข้อมูลที่ยืนยันได้ในเอกสาร แทนการเดา"],
  ["Q010", "ก่อนตอบว่าใครอนุมัติ ควรถามข้อมูลอะไรจากผู้ใช้", "ควรถามเงื่อนไขที่ขาด เช่น ข้อ, ระยะเวลา, ประเภทบริการ, % ส่วนลด"],
  ["Q011", "สรุปขั้นตอนหาผู้อนุมัติแบบสั้น", "ตอบเป็นลำดับขั้นจากเงื่อนไข -> ข้อที่เกี่ยวข้อง -> ตำแหน่งอนุมัติ"],
  ["Q012", "คำถามคลุมเครือ: ใครอนุมัติ", "ต้องไม่ฟันธงทันทีและถามกลับให้ชัดเจนก่อน"],
  ["Q013", "ถ้าผู้ใช้ขอคำตอบสั้นมาก ควรตอบอย่างไร", "ตอบสั้นแต่ต้องยังคงตำแหน่งอนุมัติที่ถูกต้องครบถ้วน"],
  ["Q014", "ให้ตอบแบบมีอ้างอิง", "ต้องตอบพร้อมอ้างอิงข้อความ/ข้อจากเอกสารที่รองรับคำตอบ"],
  ["Q015", "ถ้าถามนอกขอบเขตเอกสารอนุมัติ", "ต้องแจ้งว่าอยู่นอกข้อมูลที่มีและไม่แต่งข้อมูลเพิ่ม"],
  ["Q016", "ตรวจว่าคำตอบมั่วหรือไม่", "ถ้าไม่มีหลักฐานจากเอกสารรองรับ ให้ถือว่ามีความเสี่ยง hallucination"],
  ["Q017", "คำถามเดิมซ้ำ 2 รอบ ควรตอบคงเส้นคงวาไหม", "ควรตอบสอดคล้องเดิมเมื่อเงื่อนไขไม่เปลี่ยน"],
  ["Q018", "ถามต่อเนื่องจากข้อก่อนหน้าโดยใช้คำว่า แล้วกรณีนี้ล่ะ", "ควรใช้บริบทก่อนหน้าให้ถูกและไม่หลุดหัวข้อ"],
  ["Q019", "ต้องการคำตอบที่เทียบ 2 กรณี", "ควรจัดคำตอบให้เทียบกันชัดเจนและไม่สลับตำแหน่งอนุมัติ"],
  ["Q020", "ประเมินความครบถ้วนของคำตอบท้ายรอบ", "คำตอบที่ดีต้องตรงคำถาม อ้างอิงได้ และไม่เดาข้อมูลที่ไม่มี"],
];

const baseUrl = process.env.GATEWAY_BASE_URL || "https://aigateway.ntictsolution.com/v1";
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "rnd-vllm/gpt-oss-120b";

async function judge(question, gold, answer) {
  const body = {
    model,
    temperature: 0,
    max_tokens: 5,
    messages: [
      { role: "system", content: "You are an evaluator. Return ONLY 1 if answer satisfies gold expectation and does not fabricate. Otherwise return 0." },
      { role: "user", content: `Question: ${question}\nGold: ${gold}\nAnswer: ${answer}\nReturn only 1 or 0.` },
    ],
  };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const txt = String(json?.choices?.[0]?.message?.content || "0").trim();
  return txt.startsWith("1") ? 1 : 0;
}

async function main() {
  const seed = await prisma.conversation.findFirst({
    orderBy: { updatedAt: "desc" },
    include: { bot: true, document: true },
  });
  if (!seed) throw new Error("No conversation found for evaluation.");

  const temp = await prisma.conversation.create({
    data: {
      userId: seed.userId,
      documentId: seed.documentId,
      botId: seed.botId || undefined,
      title: "accuracy-eval-temp",
    },
  });

  let correct = 0;
  let attempted = 0;
  for (const [id, question, gold] of CASES) {
    try {
      const t0 = Date.now();
      const out = await getChatReplyForLine(temp.id, question, seed.userId);
      const latency = Date.now() - t0;
      const answer = String(out?.reply || "").replace(/\s+/g, " ").trim();
      const score = await judge(question, gold, answer);
      attempted += 1;
      correct += score;
      console.log(`${id}|score=${score}|latency=${latency}ms|answer=${answer.slice(0, 140)}`);
    } catch (error) {
      console.log(`${id}|score=SKIP|error=${error?.message || String(error)}`);
    }
  }

  const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;
  console.log(`SUMMARY|correct=${correct}|attempted=${attempted}|total=${CASES.length}|accuracy_percent=${accuracy.toFixed(2)}`);

  await prisma.conversation.delete({ where: { id: temp.id } }).catch(() => null);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("EVAL_FAILED", error?.message || error);
  await prisma.$disconnect().catch(() => null);
  process.exit(1);
});
