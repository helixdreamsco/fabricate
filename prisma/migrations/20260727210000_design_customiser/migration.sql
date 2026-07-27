-- CreateTable
CREATE TABLE "DesignJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT,
    "kind" TEXT NOT NULL,
    "taskKind" TEXT,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "paramsJson" TEXT,
    "paramsHash" TEXT NOT NULL,
    "prompt" TEXT,
    "shapedPrompt" TEXT,
    "seed" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "providerTaskId" TEXT,
    "stage" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "imageKey" TEXT,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "stateHistory" JSONB NOT NULL DEFAULT '[]',
    "failReason" TEXT,
    "badge" TEXT,
    "stlKey" TEXT,
    "glbKey" TEXT,
    "metricsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignModerationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT,
    "prompt" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignJob_userId_createdAt_idx" ON "DesignJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DesignJob_anonId_createdAt_idx" ON "DesignJob"("anonId", "createdAt");

-- CreateIndex
CREATE INDEX "DesignJob_paramsHash_createdAt_idx" ON "DesignJob"("paramsHash", "createdAt");

-- CreateIndex
CREATE INDEX "DesignModerationLog_createdAt_idx" ON "DesignModerationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DesignJob" ADD CONSTRAINT "DesignJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

