-- AlterEnum
ALTER TYPE "OfferStatus" ADD VALUE 'CANCELLED';

-- DropIndex
DROP INDEX "Offer_requestId_technicianId_key";

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "images" TEXT[];
