-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "UploadBatchStatus" AS ENUM ('uploading', 'processing', 'done', 'error');

-- CreateEnum
CREATE TYPE "UploadFileStatus" AS ENUM ('uploading', 'complete', 'error');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'user',
ALTER COLUMN "name" DROP DEFAULT;

-- CreateTable
CREATE TABLE "DocumentShare" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "UploadBatchStatus" NOT NULL DEFAULT 'uploading',
    "error" TEXT,
    "progressCurrent" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "progressMessage" TEXT,
    "progressFileName" TEXT,
    "uploadPartsTotal" INTEGER NOT NULL DEFAULT 0,
    "uploadPartsReceived" INTEGER NOT NULL DEFAULT 0,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadFile" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT,
    "totalParts" INTEGER NOT NULL,
    "receivedParts" INTEGER NOT NULL DEFAULT 0,
    "status" "UploadFileStatus" NOT NULL DEFAULT 'uploading',
    "assembledPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageDaily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "chatCount" INTEGER NOT NULL DEFAULT 0,
    "uploadBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentShare_userId_idx" ON "DocumentShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShare_documentId_userId_key" ON "DocumentShare"("documentId", "userId");

-- CreateIndex
CREATE INDEX "UploadBatch_userId_idx" ON "UploadBatch"("userId");

-- CreateIndex
CREATE INDEX "UploadFile_batchId_idx" ON "UploadFile"("batchId");

-- CreateIndex
CREATE INDEX "UsageDaily_userId_idx" ON "UsageDaily"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageDaily_userId_dateKey_key" ON "UsageDaily"("userId", "dateKey");

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadFile" ADD CONSTRAINT "UploadFile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageDaily" ADD CONSTRAINT "UsageDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
