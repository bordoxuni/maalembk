-- AlterEnum
ALTER TYPE "OfferStatus" ADD VALUE 'DONE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Offer_requestId_status_idx" ON "Offer"("requestId", "status");

-- CreateIndex
CREATE INDEX "Offer_technicianId_status_idx" ON "Offer"("technicianId", "status");

-- CreateIndex
CREATE INDEX "Request_clientId_status_createdAt_idx" ON "Request"("clientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Review_requestId_reviewerId_idx" ON "Review"("requestId", "reviewerId");

-- CreateIndex
CREATE INDEX "Review_reviewedUserId_createdAt_idx" ON "Review"("reviewedUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_selectedOfferId_fkey" FOREIGN KEY ("selectedOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
