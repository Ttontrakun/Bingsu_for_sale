-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "botId" INTEGER;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Chat_botId_idx" ON "Chat"("botId");
