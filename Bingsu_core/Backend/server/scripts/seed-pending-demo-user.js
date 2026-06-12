/**
 * สร้างบัญชีทดสอบสถานะ "รออนุมัติ" ให้ Support สาธิตกระดิ่ง + อนุมัติใน Supportadmin
 *
 * รัน: cd bb/Backend && node server/scripts/seed-pending-demo-user.js
 * หรือ: npm run seed:pending-demo
 */
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

import { prisma } from "../db.js";

/** อีเมลเดียวกันทุกครั้ง — รันซ้ำได้ (จะรีเซ็ตเป็น pending) */
const PENDING_DEMO_EMAIL = "pending.demo@askaa.local";
const PENDING_DEMO_NAME = "ผู้ใช้ทดสอบ (รออนุมัติ)";
/** รหัสสำหรับทดสอบหลังอนุมัติแล้ว (ตอน pending ล็อกอิน User app จะได้ข้อความ pending) */
const PENDING_DEMO_PASSWORD = "PendingDemo1!";

const main = async () => {
  const passwordHash = await bcrypt.hash(PENDING_DEMO_PASSWORD, 10);
  const now = new Date();

  const existing = await prisma.user.findUnique({ where: { email: PENDING_DEMO_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: PENDING_DEMO_NAME,
        passwordHash,
        role: "user",
        approvalStatus: "pending",
        isActive: true,
        emailVerifiedAt: now,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });
    console.log("[seed-pending-demo] อัปเดตเป็นสถานะรออนุมัติแล้ว");
  } else {
    await prisma.user.create({
      data: {
        email: PENDING_DEMO_EMAIL,
        name: PENDING_DEMO_NAME,
        passwordHash,
        role: "user",
        approvalStatus: "pending",
        isActive: true,
        emailVerifiedAt: now,
      },
    });
    console.log("[seed-pending-demo] สร้างบัญชีใหม่แล้ว");
  }

  console.log("");
  console.log("  อีเมล:   ", PENDING_DEMO_EMAIL);
  console.log("  รหัสผ่าน:", PENDING_DEMO_PASSWORD);
  console.log("");
  console.log("  → เปิด Supportadmin: กระดิ่ง / Overview ควรเห็นรายการรออนุมัติ");
  console.log("  → หลังอนุมัติแล้ว ล็อกอิน User app ด้วยอีเมล+รหัสด้านบนได้");
};

main()
  .catch((e) => {
    console.error("[seed-pending-demo]", e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
