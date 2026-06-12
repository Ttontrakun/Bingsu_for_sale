-- Integrations settings + message platform tracking

CREATE TYPE "IntegrationProvider" AS ENUM ('line', 'messenger', 'website', 'api');

CREATE TABLE "IntegrationSetting" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "IntegrationSetting_userId_provider_key" ON "IntegrationSetting"("userId", "provider");
CREATE INDEX "IntegrationSetting_userId_idx" ON "IntegrationSetting"("userId");

ALTER TABLE "Message"
ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'website';

CREATE INDEX "Message_platform_createdAt_idx" ON "Message"("platform", "createdAt");

