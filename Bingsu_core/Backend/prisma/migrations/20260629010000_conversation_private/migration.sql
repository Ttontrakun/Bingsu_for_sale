-- โหมดส่วนตัว: แยกห้องแชทส่วนตัวออกจากห้องปกติ
ALTER TABLE "Conversation" ADD COLUMN "private" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Conversation_userId_private_idx" ON "Conversation"("userId", "private");
