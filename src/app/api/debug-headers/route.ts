import { NextResponse } from "next/server";

// TEMPORARY diagnostic endpoint — confirms what headers + cookies actually
// reach Cloud Run when Firebase Hosting proxies. Remove once auth works.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return NextResponse.json({
    url: req.url,
    headers,
    env: {
      AUTH_URL: process.env.AUTH_URL,
      APP_URL: process.env.APP_URL,
      NODE_ENV: process.env.NODE_ENV,
    },
  });
}
