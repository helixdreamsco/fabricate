-- Per-spool inventory attached to each Printer.
CREATE TABLE "FilamentSpool" (
    "id"        TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "material"  TEXT NOT NULL,
    "brand"     TEXT,
    "colorName" TEXT NOT NULL,
    "colorHex"  TEXT NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'IN_STOCK',
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FilamentSpool_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FilamentSpool_printerId_idx" ON "FilamentSpool"("printerId");

ALTER TABLE "FilamentSpool"
    ADD CONSTRAINT "FilamentSpool_printerId_fkey"
    FOREIGN KEY ("printerId") REFERENCES "Printer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
