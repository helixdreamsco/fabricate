-- Per-maker subscription for job-match alerts and auto-bid.
-- Defaults skew toward "alerts on, auto-bid off" — alerts are passive
-- (in-app + email notifications), auto-bid moves real money so it's
-- always opt-in.

CREATE TABLE "MakerSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "makerId" TEXT NOT NULL,

  "alertsEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "alertsEmailEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "alertsRadiusKm" INTEGER NOT NULL DEFAULT 25,
  "alertsGlobal" BOOLEAN NOT NULL DEFAULT FALSE,
  "alertsStrictness" TEXT NOT NULL DEFAULT 'primary_or_alt',
  "alertsQuietStart" TEXT,
  "alertsQuietEnd" TEXT,

  "autoBidEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "autoBidUseAlertsCoverage" BOOLEAN NOT NULL DEFAULT TRUE,
  "autoBidRadiusKm" INTEGER NOT NULL DEFAULT 25,
  "autoBidGlobal" BOOLEAN NOT NULL DEFAULT FALSE,
  "autoBidStrictness" TEXT NOT NULL DEFAULT 'primary_or_alt',
  "autoBidStrategy" TEXT NOT NULL DEFAULT 'match_listed',
  "autoBidUndercutPct" INTEGER NOT NULL DEFAULT 5,
  "autoBidFixedOffsetPence" INTEGER NOT NULL DEFAULT 50,
  "autoBidMakerFloorPence" INTEGER NOT NULL DEFAULT 500,
  "autoBidEtaHours" INTEGER NOT NULL DEFAULT 48,
  "autoBidMessage" TEXT,
  "autoBidBadgeVisible" BOOLEAN NOT NULL DEFAULT TRUE,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MakerSubscription_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "MakerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MakerSubscription_makerId_key" ON "MakerSubscription"("makerId");
