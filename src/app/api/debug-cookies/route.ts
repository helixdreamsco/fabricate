import { NextResponse } from "next/server";

// TEMPORARY — dump received cookies to confirm Firebase Hosting passes
// them through unchanged. Remove once auth works.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookies = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const eq = c.indexOf("=");
      return {
        name: c.slice(0, eq),
        valueLength: c.slice(eq + 1).length,
        valuePreview: c.slice(eq + 1, eq + 1 + 40) + (c.length > 40 ? "…" : ""),
      };
    });

  // Also set a test cookie so we can see if the round-trip preserves it.
  const res = NextResponse.json({
    receivedCookies: cookies,
    rawCookieHeader: cookieHeader.slice(0, 500),
    host: req.headers.get("host"),
    xForwardedHost: req.headers.get("x-forwarded-host"),
    xForwardedProto: req.headers.get("x-forwarded-proto"),
  });
  res.cookies.set("debug-test-plain", "abc123", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });
  res.cookies.set("__Secure-debug-test-prefixed", "xyz789", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });
  return res;
}
