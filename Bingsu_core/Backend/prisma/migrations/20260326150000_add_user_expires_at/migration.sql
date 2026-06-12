-- Add user subscription expiry (Support/Admin UI)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_expiresAt_idx" ON "User"("expiresAt");

