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
  // Tighten check: NextAuth can return a non-null but anonymous session
  // object on some hosts (Cloud Run with no inbound cookie). Only treat
  // a session with a real user id as authed.
  const isAuthed = !!(req.auth as { user?: { id?: string } } | null)?.user?.id;
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

  // ── Stage 3: legal consent gate ─────────────────────────────────────
  // Authed users must have the latest accepted versions of Terms and
  // Privacy. Versions are stamped on the JWT at sign-in (and refreshed
  // via useSession().update() after acceptance). Exempt paths: the
  // accept page itself, the documents being read, account/sign-in, and
  // the OAuth + acceptance APIs.
  if (isAuthed) {
    const isExempt = CONSENT_EXEMPT_PATHS.some(
      (p) => path === p || path.startsWith(p + "/"),
    );
    if (!isExempt) {
      const t = req.auth as
        | { acceptedTermsVersion?: number; acceptedPrivacyVersion?: number }
        | null;
      const acceptedTerms = t?.acceptedTermsVersion ?? 0;
      const acceptedPrivacy = t?.acceptedPrivacyVersion ?? 0;
      if (
        acceptedTerms < REQUIRED_TERMS_VERSION ||
        acceptedPrivacy < REQUIRED_PRIVACY_VERSION
      ) {
        const url = new URL("/legal/accept", req.nextUrl.origin);
        url.searchParams.set("next", path + req.nextUrl.search);
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
});

// Mirror src/lib/legal.ts. Duplicated here because middleware runs in Edge
// runtime and can't import the lib (which pulls in prisma).
const REQUIRED_TERMS_VERSION = 1;
const REQUIRED_PRIVACY_VERSION = 1;
const CONSENT_EXEMPT_PATHS = [
  "/legal/accept",
  "/terms",
  "/privacy",
  "/acceptable-use",
  "/account",
  "/api/auth",
  "/api/legal/accept",
];

export const config = {
  matcher: [
    // Run on everything except:
    //   - /access (the gate page) and its API
    //   - /api/auth/* (NextAuth OAuth callbacks; can't gate)
    //   - /api/healthz (host liveness probe)
    //   - Next.js static assets and favicon
    "/((?!access|api/access|api/auth|api/healthz|api/readyz|_next/static|_next/image|favicon.ico).*)",
  ],
};
