-- CreateTable
CREATE TABLE "PlatformFee" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "offerId" INTEGER NOT NULL,
    "originalPrice" DOUBLE PRECISION NOT NULL,
    "feeAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "feePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFee_requestId_key" ON "PlatformFee"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFee_offerId_key" ON "PlatformFee"("offerId");

-- AddForeignKey
ALTER TABLE "PlatformFee" ADD CONSTRAINT "PlatformFee_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
