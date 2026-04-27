import { NextResponse } from "next/server";

/**
 * Liveness probe for the host (Railway / Cloud Run / etc.). Returns 200 as
 * long as the Node process is running; doesn't touch the database or any
 * downstream service so it can't false-trip during a slow Postgres restart.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "fabricate-web",
    ts: new Date().toISOString(),
  });
}
