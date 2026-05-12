import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gatherMatches } from "@/lib/reddit/poll";
import { MAX_MATCHES_PER_DIGEST } from "@/lib/reddit/config";
import { notifyRedditMonitorDigest } from "@/lib/notifications";

export const runtime = "nodejs";
// The sweep can take 10–30s when many subreddits are flowing. Push past
// the default 10s.
export const maxDuration = 60;

/**
 * Reddit monitor sweep — designed for Cloud Scheduler invocation.
 *
 * 1. Pulls /new posts + comments from each monitored subreddit.
 * 2. Filters by keywords (include + exclude).
 * 3. Inserts new matches into RedditMention (skipDuplicates on
 *    redditId — so re-runs are idempotent).
 * 4. Emails the digest of newly-inserted rows to the configured
 *    alert address. Marks them as notified.
 *
 * Authentication: `Authorization: Bearer <REDDIT_MONITOR_SECRET>`.
 * Without that env var the endpoint refuses everything so a stray
 * curl can't drain the rate limit.
 */
export async function POST(req: Request) {
  const secret = process.env.REDDIT_MONITOR_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "reddit monitor disabled (no secret configured)" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { matches, errors } = await gatherMatches();

  // Bulk-insert with skipDuplicates so we don't fight unique constraints
  // on every re-run. The returned `count` tells us how many were new.
  let insertedCount = 0;
  if (matches.length > 0) {
    const result = await prisma.redditMention.createMany({
      data: matches.map((m) => ({
        redditId: m.redditId,
        kind: m.kind,
        subreddit: m.subreddit,
        authorName: m.authorName,
        title: m.title,
        bodyExcerpt: m.bodyExcerpt,
        url: m.url,
        matchedKeyword: m.matchedKeyword,
        postedAt: m.postedAt,
      })),
      skipDuplicates: true,
    });
    insertedCount = result.count;
  }

  // Pull the rows we haven't notified on yet (covers both the just-
  // inserted ones and any from a failed prior sweep). Cap so a runaway
  // doesn't produce a 200-row email.
  const pending = await prisma.redditMention.findMany({
    where: { notifiedAt: null },
    orderBy: { postedAt: "desc" },
    take: MAX_MATCHES_PER_DIGEST,
  });

  const to = process.env.REDDIT_MONITOR_ALERT_EMAIL ?? null;
  if (pending.length > 0 && to) {
    notifyRedditMonitorDigest({
      to,
      matches: pending.map((m) => ({
        kind: m.kind as "post" | "comment",
        subreddit: m.subreddit,
        authorName: m.authorName,
        title: m.title,
        bodyExcerpt: m.bodyExcerpt,
        url: m.url,
        matchedKeyword: m.matchedKeyword,
        postedAt: m.postedAt,
      })),
    });
    await prisma.redditMention.updateMany({
      where: { id: { in: pending.map((m) => m.id) } },
      data: { notifiedAt: new Date() },
    });
  }

  return NextResponse.json({
    candidates: matches.length,
    newlyInserted: insertedCount,
    digestSize: pending.length,
    digestSent: pending.length > 0 && !!to,
    errors,
  });
}
