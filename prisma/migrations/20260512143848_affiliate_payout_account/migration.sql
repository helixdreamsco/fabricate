-- AlterTable
ALTER TABLE "AffiliateCode" ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false;
