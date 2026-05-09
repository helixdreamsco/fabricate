-- Multi-pickup-location support. Makers can list up to 5 pickup points;
-- each renders as a separate pin on the marketplace map but all roll up to
-- the same MakerProfile (and User) for reviews/reputation.
--
-- The MakerProfile.postcode/lat/lng fields are kept as a mirror of the
-- primary PickupLocation row so existing single-postcode reads (job lists,
-- bid panels, JSON-LD city) continue to work unchanged.

CREATE TABLE "PickupLocation" (
    "id"        TEXT NOT NULL,
    "makerId"   TEXT NOT NULL,
    "label"     TEXT,
    "postcode"  TEXT NOT NULL,
    "lat"       DOUBLE PRECISION,
    "lng"       DOUBLE PRECISION,
    "notes"     TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "ordering"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PickupLocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PickupLocation_makerId_ordering_idx"
    ON "PickupLocation"("makerId", "ordering");
CREATE INDEX "PickupLocation_makerId_isPrimary_idx"
    ON "PickupLocation"("makerId", "isPrimary");

ALTER TABLE "PickupLocation"
    ADD CONSTRAINT "PickupLocation_makerId_fkey"
    FOREIGN KEY ("makerId") REFERENCES "MakerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: for every MakerProfile with a postcode set, create a
-- corresponding PickupLocation row marked as primary, carrying the
-- existing geocoded lat/lng across so we don't have to re-geocode on
-- next read.
INSERT INTO "PickupLocation" (
    "id", "makerId", "postcode", "lat", "lng",
    "isPrimary", "ordering", "createdAt", "updatedAt"
)
SELECT
    'pl_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "id",
    "postcode",
    "lat",
    "lng",
    true,
    0,
    NOW(),
    NOW()
FROM "MakerProfile"
WHERE "postcode" IS NOT NULL AND length(trim("postcode")) > 0;
