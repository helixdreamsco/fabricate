/**
 * Reddit fetch wrapper. Two modes, picked by env presence:
 *
 *   1. **Public JSON** (default): hits `https://www.reddit.com/...json`
 *      with only a distinctive User-Agent. No credentials needed,
 *      no app registration. Rate limit ~10 req/min — plenty for our
 *      ~30 req/hour cadence.
 *
 *   2. **OAuth** (if REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD are
 *      all set): registers a script-app at reddit.com/prefs/apps and
 *      uses password-grant to mint bearer tokens. Rate limit ~100
 *      req/min. Only worth doing if Reddit starts cracking down on
 *      unauthenticated access — we'd see 429s in the sweep response
 *      first.
 *
 * The User-Agent header is the one thing Reddit cares about in both
 * modes — a non-distinctive UA gets 429'd fast.
 */

const REDDIT_USER_AGENT_FALLBACK =
  "fabricate-reddit-monitor/0.1 (by /u/anonymous)";

export class RedditAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedditAuthError";
  }
}

export function redditUserAgent(): string {
  return process.env.REDDIT_USER_AGENT ?? REDDIT_USER_AGENT_FALLBACK;
}

function oauthConfigured(): boolean {
  return Boolean(
    process.env.REDDIT_CLIENT_ID &&
      process.env.REDDIT_CLIENT_SECRET &&
      process.env.REDDIT_USERNAME &&
      process.env.REDDIT_PASSWORD,
  );
}

type CachedToken = { token: string; expiresAt: number };
let cached: CachedToken | null = null;

async function getRedditAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const clientId = process.env.REDDIT_CLIENT_ID!;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET!;
  const username = process.env.REDDIT_USERNAME!;
  const password = process.env.REDDIT_PASSWORD!;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "User-Agent": redditUserAgent(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RedditAuthError(
      `Reddit token exchange failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!json.access_token) {
    throw new RedditAuthError(
      `Reddit token response missing access_token (error: ${json.error ?? "unknown"})`,
    );
  }
  cached = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

/** Issue a Reddit GET. Path is `/r/<sub>/new` style — without `.json`
 *  suffix or host. The wrapper picks the right host + auth depending
 *  on whether OAuth env is configured. */
export async function redditFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (oauthConfigured()) {
    const token = await getRedditAccessToken();
    const url = path.startsWith("http")
      ? path
      : `https://oauth.reddit.com${path}`;
    return fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "User-Agent": redditUserAgent(),
      },
    });
  }

  // Unauthenticated path — public JSON. The `.json` suffix turns
  // Reddit's HTML pages into structured JSON. Add `?raw_json=1` so
  // Reddit doesn't HTML-encode `&` etc. in payloads.
  const u = path.startsWith("http")
    ? new URL(path)
    : new URL(`https://www.reddit.com${path}`);
  if (!u.pathname.endsWith(".json")) u.pathname = `${u.pathname}.json`;
  if (!u.searchParams.has("raw_json")) u.searchParams.set("raw_json", "1");
  return fetch(u.toString(), {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "User-Agent": redditUserAgent(),
    },
  });
}
