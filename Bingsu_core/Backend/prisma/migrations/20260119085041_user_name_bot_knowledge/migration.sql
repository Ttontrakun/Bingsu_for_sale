/*
  Warnings:

  - Added the required column `name` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'User';

-- Backfill name for existing users
UPDATE "User" SET "name" = "email" WHERE "name" = 'User';

-- CreateTable
CREATE TABLE "BotDocument" (
    "botId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotDocument_pkey" PRIMARY KEY ("botId","documentId")
);

-- CreateIndex
CREATE INDEX "BotDocument_documentId_idx" ON "BotDocument"("documentId");

-- AddForeignKey
ALTER TABLE "BotDocument" ADD CONSTRAINT "BotDocument_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotDocument" ADD CONSTRAINT "BotDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
