import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  code: z.string().trim().min(1).max(64),
});

const COOKIE_NAME = "fbg_access";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Verify the staging access code. On success, set the marker cookie that
 * proxy.ts checks on every request. Constant-time comparison so the code
 * isn't leaked via timing.
 */
export async function POST(req: Request) {
  const expected = process.env.STAGING_ACCESS_CODE;
  if (!expected) {
    // Gate not configured — succeed silently so the page redirects users
    // back to their target.
    const res = NextResponse.json({ ok: true, gateDisabled: true });
    res.cookies.set(COOKIE_NAME, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: req.url.startsWith("https://"),
      path: "/",
      maxAge: COOKIE_TTL_SECONDS,
    });
    return res;
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!constantTimeMatch(parsed.data.code, expected)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: req.url.startsWith("https://"),
    path: "/",
    maxAge: COOKIE_TTL_SECONDS,
  });
  return res;
}

function constantTimeMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
