import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

import { prisma } from "../db.js";

const now = new Date();

const users = [
  {
    email: "root@root.com",
    name: "Root",
    password: "root1234",
    role: "admin",
  },
  {
    email: "support@support.com",
    name: "Support",
    password: "support1234",
    role: "support",
  },
  {
    email: "user@test.com",
    name: "User Test",
    password: "user1234",
    role: "user",
  },
];

const main = async () => {
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash,
        role: u.role,
        isActive: true,
        approvalStatus: "approved",
        emailVerifiedAt: now,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        isActive: true,
        approvalStatus: "approved",
        emailVerifiedAt: now,
      },
    });
  }

  const result = await prisma.user.findMany({
    where: { email: { in: users.map((u) => u.email) } },
    select: { id: true, email: true, role: true, isActive: true, approvalStatus: true },
    orderBy: { email: "asc" },
  });

  console.log("Seeded users (ใช้ล็อกอินได้เลย):");
  for (const row of result) {
    console.log(`  - ${row.email} (${row.role})`);
  }
  console.log("");
  console.log("ล็อกอิน:");
  console.log("  Admin:   root@root.com / root1234");
  console.log("  Support: support@support.com / support1234");
  console.log("  User:    user@test.com / user1234");
};

main()
  .catch((err) => {
    console.error("Failed to seed users", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
