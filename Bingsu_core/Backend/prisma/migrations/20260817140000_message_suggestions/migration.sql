-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "suggestions" JSONB;
