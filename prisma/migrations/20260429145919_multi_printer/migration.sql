/*
  Warnings:

  - You are about to drop the column `hasAMS` on the `MakerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `materials` on the `MakerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `printerModel` on the `MakerProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "JobBid" ADD COLUMN     "printerId" TEXT;

-- AlterTable
ALTER TABLE "MakerProfile" DROP COLUMN "hasAMS",
DROP COLUMN "materials",
DROP COLUMN "printerModel";

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "makerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "printerModel" TEXT NOT NULL,
    "hasAMS" BOOLEAN NOT NULL DEFAULT false,
    "materials" TEXT NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Printer_makerId_priority_idx" ON "Printer"("makerId", "priority");

-- CreateIndex
CREATE INDEX "Printer_makerId_active_idx" ON "Printer"("makerId", "active");

-- CreateIndex
CREATE INDEX "JobBid_printerId_idx" ON "JobBid"("printerId");

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "MakerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBid" ADD CONSTRAINT "JobBid_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
