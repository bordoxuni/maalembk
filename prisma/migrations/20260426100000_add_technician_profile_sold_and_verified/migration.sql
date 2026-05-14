ALTER TABLE "TechnicianProfile"
ADD COLUMN IF NOT EXISTS "sold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TechnicianProfile"
SET "sold" = 0
WHERE "sold" IS NULL;

UPDATE "TechnicianProfile"
SET "isVerified" = false
WHERE "isVerified" IS NULL;
