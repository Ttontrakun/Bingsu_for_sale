-- โหมดส่วนตัว: เพิ่มช่อง "คำสั่ง AI (instructions)" แยกจาก content (ข้อมูล/ความรู้)
ALTER TABLE "PrivateContext" ADD COLUMN "instructions" TEXT NOT NULL DEFAULT '';
