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

const allowedModes = new Set(["bootstrap", "reset", "dry-run"]);
const cliArgs = process.argv.slice(2);
const modeArg = cliArgs.find((arg) => arg.startsWith("--mode="));
const mode = (modeArg ? modeArg.split("=")[1] : "bootstrap").toLowerCase();
const forceReset = cliArgs.includes("--force-reset");
const allowProdSeed = String(process.env.ALLOW_PROD_SEED || "false").toLowerCase() === "true";
const nodeEnv = String(process.env.NODE_ENV || "development").toLowerCase();

if (!allowedModes.has(mode)) {
  console.error(`Invalid mode: ${mode}. Use --mode=bootstrap|reset|dry-run`);
  process.exit(1);
}

if (nodeEnv === "production" && !allowProdSeed) {
  console.error("Refused: NODE_ENV=production. Set ALLOW_PROD_SEED=true to run intentionally.");
  process.exit(1);
}

if (mode === "reset" && !forceReset) {
  console.error("Refused reset mode without --force-reset.");
  process.exit(1);
}

const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
};

const users = [
  {
    email: required("SEED_ADMIN_EMAIL").toLowerCase(),
    name: String(process.env.SEED_ADMIN_NAME || "System Admin").trim(),
    password: required("SEED_ADMIN_PASSWORD"),
    role: "admin",
  },
  {
    email: required("SEED_SUPPORT_EMAIL").toLowerCase(),
    name: String(process.env.SEED_SUPPORT_NAME || "Support Admin").trim(),
    password: required("SEED_SUPPORT_PASSWORD"),
    role: "support",
  },
];

const extraUserEmail = String(process.env.SEED_EXTRA_USER_EMAIL || "").trim().toLowerCase();
if (extraUserEmail) {
  users.push({
    email: extraUserEmail,
    name: String(process.env.SEED_EXTRA_USER_NAME || "Extra User").trim(),
    password: required("SEED_EXTRA_USER_PASSWORD"),
    role: String(process.env.SEED_EXTRA_USER_ROLE || "user").trim().toLowerCase() || "user",
  });
}

const ensureStrongPassword = (value, label) => {
  const text = String(value || "");
  const hasUpper = /[A-Z]/.test(text);
  const hasLower = /[a-z]/.test(text);
  const hasNumber = /[0-9]/.test(text);
  const hasSymbol = /[^A-Za-z0-9]/.test(text);
  if (text.length < 12 || !hasUpper || !hasLower || !hasNumber || !hasSymbol) {
    throw new Error(`${label} must be 12+ chars and include upper/lower/number/symbol`);
  }
};

const main = async () => {
  ensureStrongPassword(users[0].password, "SEED_ADMIN_PASSWORD");
  ensureStrongPassword(users[1].password, "SEED_SUPPORT_PASSWORD");
  if (users[2]) {
    ensureStrongPassword(users[2].password, "SEED_EXTRA_USER_PASSWORD");
  }

  if (mode === "dry-run") {
    console.log("[seed-admins] dry-run mode");
    for (const u of users) {
      const exists = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true, role: true } });
      console.log(`- ${u.email} (${u.role}) => ${exists ? `EXISTS role=${exists.role}` : "WILL_CREATE"}`);
    }
    return;
  }

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (mode === "bootstrap") {
      if (existing) {
        console.log(`[seed-admins] skip existing ${u.email}`);
        continue;
      }
      const passwordHash = await bcrypt.hash(u.password, 10);
      await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash,
          role: u.role,
          isActive: true,
          approvalStatus: "approved",
          emailVerifiedAt: now,
        },
      });
      console.log(`[seed-admins] created ${u.email} (${u.role})`);
      continue;
    }

    // mode === "reset"
    if (!existing) {
      console.log(`[seed-admins] cannot reset missing user ${u.email}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.update({
      where: { email: u.email },
      data: {
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
    });
    console.log(`[seed-admins] reset ${u.email} (${u.role})`);
  }

  const result = await prisma.user.findMany({
    where: { email: { in: users.map((u) => u.email) } },
    select: { id: true, email: true, role: true, isActive: true, approvalStatus: true },
    orderBy: { email: "asc" },
  });

  console.log("Seeded users:");
  for (const row of result) {
    console.log(`  - ${row.email} (${row.role}) active=${row.isActive} approval=${row.approvalStatus}`);
  }
  console.log("");
  console.log("Mode:", mode);
  console.log("Login credentials used in this run:");
  console.log(`  Admin:   ${users[0].email} / <provided via SEED_ADMIN_PASSWORD>`);
  console.log(`  Support: ${users[1].email} / <provided via SEED_SUPPORT_PASSWORD>`);
  if (users[2]) {
    console.log(`  Extra:   ${users[2].email} / <provided via SEED_EXTRA_USER_PASSWORD>`);
  }
};

main()
  .catch((err) => {
    console.error("Failed to seed users", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
