import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Readiness probe — confirms the service can actually serve traffic by
 * touching the database. Distinct from /api/healthz (liveness): if Postgres
 * is down, this returns 503 and the host should pull the instance from
 * load balancers, but liveness still says ok so the host doesn't restart
 * the process pointlessly.
 *
 * Use this URL for readiness probes on Cloud Run / k8s / Vercel checks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ready",
      service: "fabricate-web",
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "not-ready",
        service: "fabricate-web",
        error: err instanceof Error ? err.message : "unknown",
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
