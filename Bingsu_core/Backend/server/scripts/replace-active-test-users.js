import bcrypt from "bcryptjs";
import { prisma } from "../db.js";

const OLD_EMAILS = [
  "user.active1@test.local",
  "user.active2@test.local",
  "user.active3@test.local",
  "user.active4@test.local",
];

const EASY_USERS = [
  { email: "test1@test.local", name: "Test User 1", password: "Test1234!" },
  { email: "test2@test.local", name: "Test User 2", password: "Test1234!" },
  { email: "test3@test.local", name: "Test User 3", password: "Test1234!" },
  { email: "test4@test.local", name: "Test User 4", password: "Test1234!" },
];

const main = async () => {
  const now = new Date();

  await prisma.user.deleteMany({
    where: {
      email: { in: OLD_EMAILS },
    },
  });

  for (const user of EASY_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: "user",
        isActive: true,
        approvalStatus: "approved",
        emailVerifiedAt: now,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
      create: {
        email: user.email,
        name: user.name,
        passwordHash,
        role: "user",
        isActive: true,
        approvalStatus: "approved",
        emailVerifiedAt: now,
      },
    });
  }

  console.log("Replaced 4 active test users with easier credentials:");
  EASY_USERS.forEach((u) => {
    console.log(`- ${u.email} / ${u.password}`);
  });
};

main()
  .catch((err) => {
    console.error("[replace-active-test-users]", err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
