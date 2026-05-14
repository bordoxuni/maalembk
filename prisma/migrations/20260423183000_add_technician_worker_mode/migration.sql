ALTER TABLE "TechnicianProfile"
ADD COLUMN IF NOT EXISTS "isWorkerMode" BOOLEAN NOT NULL DEFAULT true;

UPDATE "TechnicianProfile"
SET "isWorkerMode" = true
WHERE "isWorkerMode" IS NULL;
