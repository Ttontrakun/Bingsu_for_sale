-- Add role to document shares
CREATE TYPE "DocumentShareRole" AS ENUM ('viewer', 'editor');

ALTER TABLE "DocumentShare"
ADD COLUMN "role" "DocumentShareRole" NOT NULL DEFAULT 'viewer';
