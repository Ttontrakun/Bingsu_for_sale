-- ปักหมุดแชท: แชทที่ปักหมุดจะลบไม่ได้ และไม่ถูกล้างโดย chat retention
ALTER TABLE "Conversation" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
