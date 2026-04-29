import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/jobs/[id]/test-strip/request — creator requests a free test
 * strip (typically after a print issue). Idempotent — sets the timestamp
 * once and is a no-op afterwards.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: { id: true, creatorId: true, testStripRequestedByCreatorAt: true },
  });
  if (!job)
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  if (job.creatorId !== session.user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (job.testStripRequestedByCreatorAt) {
    return NextResponse.json({
      requestedAt: job.testStripRequestedByCreatorAt.toISOString(),
      alreadyRequested: true,
    });
  }

  const updated = await prisma.job.update({
    where: { id },
    data: { testStripRequestedByCreatorAt: new Date() },
    select: { testStripRequestedByCreatorAt: true },
  });
  return NextResponse.json({
    requestedAt: updated.testStripRequestedByCreatorAt!.toISOString(),
    alreadyRequested: false,
  });
}
