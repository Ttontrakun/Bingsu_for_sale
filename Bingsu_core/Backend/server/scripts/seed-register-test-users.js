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

const ACTIVE_USERS = [
  { email: "user.active1@test.local", name: "User Active 1", password: "UserActive1!" },
  { email: "user.active2@test.local", name: "User Active 2", password: "UserActive2!" },
  { email: "user.active3@test.local", name: "User Active 3", password: "UserActive3!" },
  { email: "user.active4@test.local", name: "User Active 4", password: "UserActive4!" },
];

const UNVERIFIED_USERS = Array.from({ length: 10 }, (_, idx) => {
  const n = idx + 1;
  return {
    email: `user.unverified${n}@test.local`,
    name: `User Unverified ${n}`,
    password: `UserUnverified${n}!`,
  };
});

const EXPIRING_USERS = [
  { email: "user.expiring1@test.local", name: "User Expiring 1", password: "UserExpiring1!", daysToExpire: 1 },
  { email: "user.expiring2@test.local", name: "User Expiring 2", password: "UserExpiring2!", daysToExpire: 2 },
  { email: "user.expiring3@test.local", name: "User Expiring 3", password: "UserExpiring3!", daysToExpire: 3 },
];

const hasUserExpiresAtColumn = async () => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'User'
        AND column_name = 'expiresAt'
      LIMIT 1;
    `;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
};

const buildExpireDate = (daysToExpire) => new Date(Date.now() + Number(daysToExpire) * 24 * 60 * 60 * 1000);

const main = async () => {
  const hasExpiresAt = await hasUserExpiresAtColumn();

  for (const u of ACTIVE_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
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
        email: u.email,
        name: u.name,
        passwordHash,
        role: "user",
        isActive: true,
        approvalStatus: "approved",
        emailVerifiedAt: now,
      },
    });
  }

  for (const u of UNVERIFIED_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash,
        role: "user",
        isActive: true,
        approvalStatus: "pending",
        emailVerifiedAt: null,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: "user",
        isActive: true,
        approvalStatus: "pending",
        emailVerifiedAt: null,
      },
    });
  }

  for (const u of EXPIRING_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const expiresAt = buildExpireDate(u.daysToExpire);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash,
        role: "user",
        isActive: true,
        approvalStatus: "approved",
        emailVerifiedAt: now,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        ...(hasExpiresAt ? { expiresAt } : {}),
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: "user",
        isActive: true,
        approvalStatus: "approved",
        emailVerifiedAt: now,
        ...(hasExpiresAt ? { expiresAt } : {}),
      },
    });
  }

  console.log("\n=== TEST USERS CREATED ===");
  console.log("\n[1] Active users (approved + verified):");
  ACTIVE_USERS.forEach((u) => console.log(`- ${u.email} / ${u.password}`));

  console.log("\n[2] Pending users (not email-verified yet):");
  UNVERIFIED_USERS.forEach((u) => console.log(`- ${u.email} / ${u.password}`));

  console.log("\n[3] Expiring users (approved + verified):");
  EXPIRING_USERS.forEach((u) => {
    const exp = buildExpireDate(u.daysToExpire).toISOString();
    console.log(`- ${u.email} / ${u.password} (expires in ${u.daysToExpire} day(s): ${exp})`);
  });

  if (!hasExpiresAt) {
    console.log("\n[notice] 'expiresAt' column not found; expiring users were created without expiry date.");
  }
};

main()
  .catch((error) => {
    console.error("[seed-register-test-users]", error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
