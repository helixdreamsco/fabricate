import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Two layered gates:
 *
 *   1. **Staging access gate** — when `STAGING_ACCESS_CODE` is set, every
 *      request must carry the `fbg_access=1` cookie or it's bounced to
 *      `/access`. The cookie is set after the visitor enters the right
 *      code on /access. Disabled in environments where the env var is
 *      unset (production / local dev), so this has no effect by default.
 *
 *   2. **Auth gate** — the existing per-route auth requirement. Sends
 *      unauthenticated users to /account?callbackUrl=… for the routes
 *      listed in the inline `needsAuth` predicate.
 *
 * The matcher excludes the bypass paths the gates themselves depend on
 * (the access page + its API, OAuth callbacks, the health check, and
 * Next.js static assets).
 */

const ACCESS_COOKIE = "fbg_access";

export default auth((req) => {
  const path = req.nextUrl.pathname;

  // ── Stage 1: staging access gate ────────────────────────────────────
  if (process.env.STAGING_ACCESS_CODE) {
    const cookie = req.cookies.get(ACCESS_COOKIE)?.value;
    if (cookie !== "1") {
      const url = new URL("/access", req.nextUrl.origin);
      url.searchParams.set("from", path + req.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  // ── Stage 2: auth gate (existing) ───────────────────────────────────
  const isAuthed = !!req.auth;
  const needsAuth =
    path.startsWith("/checkout") ||
    path.startsWith("/order") ||
    path === "/jobs" ||
    path.startsWith("/jobs/") ||
    path === "/market" ||
    path.startsWith("/market/") ||
    path === "/maker" ||
    path.startsWith("/maker/") ||
    path === "/communities" ||
    path.startsWith("/communities/") ||
    (path.startsWith("/c/") && path.length > 3);

  if (needsAuth && !isAuthed) {
    const signIn = new URL("/account", req.nextUrl.origin);
    signIn.searchParams.set("callbackUrl", path + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on everything except:
    //   - /access (the gate page) and its API
    //   - /api/auth/* (NextAuth OAuth callbacks; can't gate)
    //   - /api/healthz (host liveness probe)
    //   - Next.js static assets and favicon
    "/((?!access|api/access|api/auth|api/healthz|_next/static|_next/image|favicon.ico).*)",
  ],
};
