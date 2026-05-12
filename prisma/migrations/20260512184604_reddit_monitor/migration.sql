-- CreateTable
CREATE TABLE "RedditMention" (
    "id" TEXT NOT NULL,
    "redditId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subreddit" TEXT NOT NULL,
    "authorName" TEXT,
    "title" TEXT,
    "bodyExcerpt" TEXT,
    "url" TEXT NOT NULL,
    "matchedKeyword" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "RedditMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RedditMention_redditId_key" ON "RedditMention"("redditId");

-- CreateIndex
CREATE INDEX "RedditMention_capturedAt_idx" ON "RedditMention"("capturedAt");

-- CreateIndex
CREATE INDEX "RedditMention_notifiedAt_idx" ON "RedditMention"("notifiedAt");
