/**
 * สร้างผู้สมัครทดสอบ 5 คน (สถานะรออนุมัติ) สำหรับ Supportadmin / Overview
 *
 * รัน: cd bb/Backend && node server/scripts/seed-demo-applicants.js
 * หรือ: npm run seed:demo-applicants
 * Docker: docker compose exec legacy npm run seed:demo-applicants
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

const SHARED_PASSWORD = "ApplicantDemo1!";

const APPLICANTS = [
  { email: "applicant1@demo.local", name: "สมชาย ใจดี" },
  { email: "applicant2@demo.local", name: "สมหญิง รักดี" },
  { email: "applicant3@demo.local", name: "วิชัย ทดสอบ" },
  { email: "applicant4@demo.local", name: "มาลี แสงใส" },
  { email: "applicant5@demo.local", name: "ประเสริฐ สมัครใหม่" },
];

const main = async () => {
  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
  const now = new Date();

  for (const a of APPLICANTS) {
    await prisma.user.upsert({
      where: { email: a.email },
      update: {
        name: a.name,
        passwordHash,
        role: "user",
        approvalStatus: "pending",
        isActive: true,
        emailVerifiedAt: now,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
      create: {
        email: a.email,
        name: a.name,
        passwordHash,
        role: "user",
        approvalStatus: "pending",
        isActive: true,
        emailVerifiedAt: now,
      },
    });
  }

  console.log("สร้าง/อัปเดตผู้สมัครทดสอบ 5 คน (รออนุมัติ) แล้ว:\n");
  for (const a of APPLICANTS) {
    console.log(`  - ${a.name} <${a.email}>`);
  }
  console.log("\nรหัสผ่านเดียวกันทุกบัญชี (หลังอนุมัติแล้วใช้ล็อกอิน User app):", SHARED_PASSWORD);
  console.log("\n→ เปิด Supportadmin Overview จะเห็นป้าย «รอดำเนินการ» / กระดิ่งแจ้งเตือน\n");
};

main()
  .catch((e) => {
    console.error("[seed-demo-applicants]", e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
