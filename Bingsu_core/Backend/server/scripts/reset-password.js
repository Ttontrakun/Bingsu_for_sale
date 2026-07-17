// รีเซ็ตรหัสผ่านผู้ใช้ทีละคน (ใช้ตอนลืมรหัส support/admin)
//
// วิธีใช้ (รันในคอนเทนเนอร์ legacy):
//   1) ดูรายชื่อบัญชี admin/support:
//        docker compose exec legacy node server/scripts/reset-password.js --list
//   2) รีเซ็ตรหัสของอีเมลที่ต้องการ:
//        docker compose exec -e RESET_EMAIL=support@example.com -e RESET_PASSWORD='NewPass123!' \
//          legacy node server/scripts/reset-password.js
//
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";

const listMode = process.argv.includes("--list");

const main = async () => {
  if (listMode) {
    const users = await prisma.user.findMany({
      where: { role: { in: ["admin", "support", "admin_metrics"] } },
      select: { email: true, name: true, role: true, isActive: true, approvalStatus: true },
      orderBy: { role: "asc" },
    });
    console.log("บัญชี admin/support ในระบบ:");
    if (!users.length) console.log("  (ไม่พบ)");
    for (const u of users) {
      console.log(`  - ${u.email}  [${u.role}]  active=${u.isActive} approval=${u.approvalStatus}  ${u.name || ""}`);
    }
    return;
  }

  const email = String(process.env.RESET_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.RESET_PASSWORD || "");

  if (!email || !password) {
    console.error("ต้องระบุ RESET_EMAIL และ RESET_PASSWORD");
    console.error("ตัวอย่าง: RESET_EMAIL=support@example.com RESET_PASSWORD='NewPass123!' node server/scripts/reset-password.js");
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("รหัสผ่านควรยาวอย่างน้อย 8 ตัวอักษร");
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    console.error(`ไม่พบบัญชี: ${email}  (ลองรันด้วย --list เพื่อดูอีเมลที่มี)`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { email },
    data: {
      passwordHash,
      isActive: true,
      approvalStatus: "approved",
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });
  console.log(`✅ รีเซ็ตรหัสผ่านสำเร็จ: ${email} [${existing.role}]`);
  console.log("   ล็อกอินด้วยรหัสใหม่ได้เลย");
};

main()
  .catch((err) => {
    console.error("รีเซ็ตล้มเหลว:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
