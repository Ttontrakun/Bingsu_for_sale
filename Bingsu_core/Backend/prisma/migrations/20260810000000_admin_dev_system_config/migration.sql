-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'admin_dev';

-- SystemConfig for Admin Dev Studio (single-tenant product customization)
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL DEFAULT 'pro',
    "features" JSONB NOT NULL,
    "menus" JSONB NOT NULL,
    "copy" JSONB NOT NULL,
    "branding" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SystemConfig" ("id", "packageId", "features", "menus", "copy", "branding", "updatedAt")
VALUES (
  'default',
  'pro',
  $json${
    "user.createBot": false,
    "user.uploadDocuments": false
  }$json$::jsonb,
  $json${
    "admin": [
      { "id": "dashboard", "enabled": true },
      { "id": "manual", "enabled": true },
      { "id": "bots", "enabled": true },
      { "id": "knowledge", "enabled": true },
      { "id": "supportPanel", "enabled": true },
      { "id": "feedback", "enabled": true },
      { "id": "system", "enabled": true },
      { "id": "logs", "enabled": true }
    ],
    "user": [
      { "id": "home", "enabled": true },
      { "id": "private", "enabled": true },
      { "id": "history", "enabled": true },
      { "id": "createBot", "enabled": false },
      { "id": "uploadDocs", "enabled": false }
    ]
  }$json$::jsonb,
  $json${
    "user.login.title": "Enterprise AI Chatbot",
    "user.homepage.title": "Welcome to Enterprise AI Chatbot LLM",
    "user.homepage.description": "ค้นหาข้อมูลจากเอกสารที่มีในระบบ และตอบคำถามตามเนื้อหาในเอกสารนั้น พร้อมระบุแหล่งอ้างอิงให้ตรวจสอบได้",
    "user.homepage.placeholder": "ถามเกี่ยวกับเอกสารในระบบ เช่น \"อัตราค่าบริการ NT Corporate Internet\""
  }$json$::jsonb,
  $json${
    "appName": "Enterprise AI Chatbot",
    "logoUrl": null
  }$json$::jsonb,
  CURRENT_TIMESTAMP
);
