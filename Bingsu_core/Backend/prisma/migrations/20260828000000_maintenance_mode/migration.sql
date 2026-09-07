-- โหมดปิดปรับปรุงฝั่งผู้ใช้ (Maintenance page)
CREATE TABLE "MaintenanceMode" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL DEFAULT 'เว็บมีปัญหา กำลังแก้ไข กรุณาลองใหม่อีกครั้งในภายหลัง',
    "contactEmail" TEXT NOT NULL DEFAULT 'aisupport@ntplc.co.th',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "MaintenanceMode_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MaintenanceMode" ("id", "enabled", "message", "contactEmail", "updatedAt")
VALUES (
  'default',
  false,
  'เว็บมีปัญหา กำลังแก้ไข กรุณาลองใหม่อีกครั้งในภายหลัง',
  'aisupport@ntplc.co.th',
  CURRENT_TIMESTAMP
);
