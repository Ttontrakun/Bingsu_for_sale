-- CreateEnum
CREATE TYPE "DocumentShareRole" AS ENUM ('viewer', 'editor');

-- CreateTable
CREATE TABLE "Bot" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "description" TEXT,
    "model" TEXT,
    "avatarUrl" TEXT,
    "ownerId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotDocument" (
    "botId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotDocument_pkey" PRIMARY KEY ("botId","documentId")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "displayName" TEXT NOT NULL,
    "ragStoreName" TEXT NOT NULL,
    "sourceFiles" JSONB NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentShare" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "DocumentShareRole" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bot_ownerId_idx" ON "Bot"("ownerId");

-- CreateIndex
CREATE INDEX "BotDocument_documentId_idx" ON "BotDocument"("documentId");

-- CreateIndex
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");

-- CreateIndex
CREATE INDEX "DocumentShare_documentId_idx" ON "DocumentShare"("documentId");

-- CreateIndex
CREATE INDEX "DocumentShare_userId_idx" ON "DocumentShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShare_documentId_userId_key" ON "DocumentShare"("documentId", "userId");

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotDocument" ADD CONSTRAINT "BotDocument_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotDocument" ADD CONSTRAINT "BotDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
