-- Add tags to documents
ALTER TABLE "Document"
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
