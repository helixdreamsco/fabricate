-- User-uploaded vector assets (brand logos) usable as `asset` template params.
--
-- Rows are immutable: a template's parameter JSON references an asset by id
-- and the geometry cache assumes that id always resolves to the same artwork.
-- Re-uploading identical bytes reuses the existing row via (userId,
-- contentHash), so a user picking the same logo twice doesn't fork the cache.
CREATE TABLE "DesignAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'svg',
    "contentHash" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "svgKey" TEXT NOT NULL,
    "geometryKey" TEXT NOT NULL,
    "widthUnits" DOUBLE PRECISION NOT NULL,
    "heightUnits" DOUBLE PRECISION NOT NULL,
    "shapeCount" INTEGER NOT NULL,
    "autoOutlined" BOOLEAN NOT NULL DEFAULT false,
    "moderationVerdict" TEXT NOT NULL DEFAULT 'pending',
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DesignAsset_userId_contentHash_key" ON "DesignAsset"("userId", "contentHash");
CREATE INDEX "DesignAsset_userId_createdAt_idx" ON "DesignAsset"("userId", "createdAt");

ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
