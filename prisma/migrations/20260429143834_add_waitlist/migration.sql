-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_kind_createdAt_idx" ON "WaitlistEntry"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_email_kind_key" ON "WaitlistEntry"("email", "kind");
