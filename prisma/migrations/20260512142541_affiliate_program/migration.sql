-- AlterTable
ALTER TABLE "User" ADD COLUMN     "affiliateBonusClaimed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referredByCodeId" TEXT;

-- CreateTable
CREATE TABLE "AffiliateCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "balancePence" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarnedPence" INTEGER NOT NULL DEFAULT 0,
    "paidOutPence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateEarning" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stripeTransferId" TEXT,
    "failureReason" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'sim',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCode_code_key" ON "AffiliateCode"("code");

-- CreateIndex
CREATE INDEX "AffiliateCode_ownerId_idx" ON "AffiliateCode"("ownerId");

-- CreateIndex
CREATE INDEX "AffiliateEarning_codeId_createdAt_idx" ON "AffiliateEarning"("codeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateEarning_jobId_codeId_key" ON "AffiliateEarning"("jobId", "codeId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePayout_stripeTransferId_key" ON "AffiliatePayout"("stripeTransferId");

-- CreateIndex
CREATE INDEX "AffiliatePayout_codeId_status_idx" ON "AffiliatePayout"("codeId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByCodeId_fkey" FOREIGN KEY ("referredByCodeId") REFERENCES "AffiliateCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCode" ADD CONSTRAINT "AffiliateCode_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateEarning" ADD CONSTRAINT "AffiliateEarning_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "AffiliateCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateEarning" ADD CONSTRAINT "AffiliateEarning_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "AffiliateCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
