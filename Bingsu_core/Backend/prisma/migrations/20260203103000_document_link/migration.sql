-- Add optional link field to Document (for knowledge reference URL)

ALTER TABLE "Document"
ADD COLUMN "link" TEXT;

