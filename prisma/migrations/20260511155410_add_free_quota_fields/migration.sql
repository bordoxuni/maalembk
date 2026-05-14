-- AlterTable
ALTER TABLE "TechnicianProfile" ADD COLUMN     "freeMissionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "freeMissionMonth" INTEGER,
ADD COLUMN     "freeMissionYear" INTEGER;
