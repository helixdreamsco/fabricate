import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { API_HOST, serviceAuthHeaders } from "@/lib/api-host";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { resolvePyRoute } from "@/lib/py-proxy-routes";

/**
 * Browser-facing proxy to the FastAPI service.
 *
 * This used to be a `rewrites()` entry in next.config.ts, which forwarded
 * the browser's request verbatim — no Authorization header. The API is a
 * private Cloud Run service, so every one of those was rejected with 403
 * and surfaced as a 500. /configure has therefore never shown a
 * server-verified quote in production: it silently fell back to the client
 * estimate every time.
 *
 * A route handler can do what a rewrite can't — mint the ID token, keep the
 * API private, and decide which endpoints the public may reach at all.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Under Cloud Run's 60s request ceiling on this service. A slice that runs
 * longer is not lost: the API keeps going to its own 120s limit and caches
 * the result, so the next re-quote picks it up instantly. Meanwhile the
 * creator keeps the client-side estimate, which is what they were looking
 * at anyway.
 */
const UPSTREAM_TIMEOUT_MS = 55_000;

/** Hop-by-hop headers — forwarding these corrupts the proxied response. */
const STRIP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

async function proxy(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const route = resolvePyRoute(path);

  // Unknown endpoint: 404 rather than 403, so this doesn't become a
  // directory of what the internal service offers.
  if (!route) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (route.access === "signed-in") {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
    }
  }

  if (
    !checkRateLimit({
      key: `py:${path[0]}:${rateLimitKey(req)}`,
      limit: route.limitPerMin,
      windowMs: 60_000,
    })
  ) {
    return NextResponse.json(
      { error: "rate limited — try again in a minute" },
      { status: 429 },
    );
  }

  const url = new URL(req.url);
  const target = `${API_HOST}/${path[0]}${url.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  for (const [k, v] of Object.entries(await serviceAuthHeaders())) {
    headers.set(k, v);
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      // Streamed rather than buffered: these bodies carry mesh files up to
      // 80 MB and this service runs at concurrency 80 on 1 GiB.
      body: req.method === "GET" ? undefined : req.body,
      // Required by undici whenever body is a stream.
      duplex: "half",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    } as RequestInit & { duplex: "half" });

    const out = new Headers();
    upstream.headers.forEach((v, k) => {
      if (!STRIP.has(k.toLowerCase())) out.set(k, v);
    });
    return new NextResponse(upstream.body, { status: upstream.status, headers: out });
  } catch (err) {
    // Timeouts and connection failures both land here. Callers already
    // degrade to the client-side estimate, so a 503 is a signal, not a
    // failure the user has to see.
    const timedOut = (err as Error)?.name === "TimeoutError";
    console.warn(
      `[api/py] ${path[0]} ${timedOut ? "timed out" : "failed"}:`,
      (err as Error)?.message,
    );
    return NextResponse.json(
      { error: timedOut ? "upstream timeout" : "upstream unavailable" },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
