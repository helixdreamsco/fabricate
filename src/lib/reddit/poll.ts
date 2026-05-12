/**
 * Reddit polling — pulls /new posts + /comments from each monitored
 * subreddit, runs them through the keyword filter, returns a flat
 * list of match candidates. Dedup against the DB happens in the
 * caller (sweep route) so we can record matches transactionally.
 */

import { redditFetch } from "./auth";
import {
  BODY_EXCERPT_MAX_CHARS,
  EXCLUDE_KEYWORDS,
  INCLUDE_KEYWORDS,
  MONITORED_SUBREDDITS,
} from "./config";

export type MatchCandidate = {
  /** Reddit's full id including prefix — t3_ for posts, t1_ for comments. */
  redditId: string;
  kind: "post" | "comment";
  subreddit: string;
  authorName: string | null;
  title: string | null;
  bodyExcerpt: string | null;
  url: string;
  matchedKeyword: string;
  postedAt: Date;
};

type RedditListingChild<T> = { kind: string; data: T };
type RedditListing<T> = {
  data: { children: RedditListingChild<T>[]; after: string | null };
};

type RedditPost = {
  id: string;
  name: string; // t3_xxxxx
  subreddit: string;
  author: string;
  title: string;
  selftext: string;
  permalink: string;
  created_utc: number;
  over_18?: boolean;
  removed?: boolean;
  // Some endpoints omit; default false.
  stickied?: boolean;
};

type RedditComment = {
  id: string;
  name: string; // t1_xxxxx
  subreddit: string;
  author: string;
  body: string;
  permalink: string;
  link_title?: string;
  created_utc: number;
};

/** Run a substring match (case-insensitive). Returns the first include
 *  keyword that hits, or null. Suppresses if an exclude keyword fires. */
export function matchKeyword(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const ex of EXCLUDE_KEYWORDS) {
    if (lower.includes(ex)) return null;
  }
  for (const kw of INCLUDE_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

function permalinkToUrl(permalink: string): string {
  return `https://www.reddit.com${permalink.startsWith("/") ? permalink : `/${permalink}`}`;
}

function excerpt(text: string): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= BODY_EXCERPT_MAX_CHARS) return cleaned;
  return `${cleaned.slice(0, BODY_EXCERPT_MAX_CHARS - 1)}…`;
}

/** Pull the most recent N posts from one subreddit. We use the
 *  `?limit=` query param to cap, then filter client-side. */
async function fetchNewPosts(
  subreddit: string,
  limit: number,
): Promise<RedditPost[]> {
  const res = await redditFetch(
    `/r/${encodeURIComponent(subreddit)}/new?limit=${limit}`,
  );
  if (!res.ok) {
    throw new Error(
      `Reddit listing failed for r/${subreddit} (${res.status})`,
    );
  }
  const json = (await res.json()) as RedditListing<RedditPost>;
  return json.data.children
    .filter((c) => c.kind === "t3" && c.data)
    .map((c) => c.data);
}

async function fetchNewComments(
  subreddit: string,
  limit: number,
): Promise<RedditComment[]> {
  const res = await redditFetch(
    `/r/${encodeURIComponent(subreddit)}/comments?limit=${limit}`,
  );
  if (!res.ok) {
    throw new Error(
      `Reddit comments fetch failed for r/${subreddit} (${res.status})`,
    );
  }
  const json = (await res.json()) as RedditListing<RedditComment>;
  return json.data.children
    .filter((c) => c.kind === "t1" && c.data)
    .map((c) => c.data);
}

/** Sweep every monitored subreddit. Posts and comments share a single
 *  output stream. Errors on individual subreddits are swallowed (with
 *  the error attached to `errors`) so one banned sub doesn't kill the
 *  whole sweep. */
export async function gatherMatches({
  postsPerSub = 25,
  commentsPerSub = 50,
}: { postsPerSub?: number; commentsPerSub?: number } = {}): Promise<{
  matches: MatchCandidate[];
  errors: Array<{ subreddit: string; message: string }>;
}> {
  const matches: MatchCandidate[] = [];
  const errors: Array<{ subreddit: string; message: string }> = [];

  for (const sub of MONITORED_SUBREDDITS) {
    try {
      const [posts, comments] = await Promise.all([
        fetchNewPosts(sub, postsPerSub),
        fetchNewComments(sub, commentsPerSub),
      ]);

      for (const p of posts) {
        if (p.stickied || p.removed || p.over_18) continue;
        const haystack = `${p.title}\n${p.selftext}`;
        const hit = matchKeyword(haystack);
        if (!hit) continue;
        matches.push({
          redditId: p.name,
          kind: "post",
          subreddit: p.subreddit,
          authorName: p.author ?? null,
          title: p.title,
          bodyExcerpt: excerpt(p.selftext),
          url: permalinkToUrl(p.permalink),
          matchedKeyword: hit,
          postedAt: new Date(p.created_utc * 1000),
        });
      }

      for (const c of comments) {
        const hit = matchKeyword(c.body);
        if (!hit) continue;
        matches.push({
          redditId: c.name,
          kind: "comment",
          subreddit: c.subreddit,
          authorName: c.author ?? null,
          title: c.link_title ?? null,
          bodyExcerpt: excerpt(c.body),
          url: permalinkToUrl(c.permalink),
          matchedKeyword: hit,
          postedAt: new Date(c.created_utc * 1000),
        });
      }
    } catch (err) {
      errors.push({
        subreddit: sub,
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return { matches, errors };
}
