import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/jobs/[id]/test-strip/offer — assigned maker preemptively
 * offers a test strip to the creator (makes the card visible on the
 * creator's job page). Idempotent.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      assignedMakerId: true,
      testStripOfferedByMakerAt: true,
    },
  });
  if (!job)
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  if (job.assignedMakerId !== profile.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (job.testStripOfferedByMakerAt) {
    return NextResponse.json({
      offeredAt: job.testStripOfferedByMakerAt.toISOString(),
      alreadyOffered: true,
    });
  }

  const updated = await prisma.job.update({
    where: { id },
    data: { testStripOfferedByMakerAt: new Date() },
    select: { testStripOfferedByMakerAt: true },
  });
  return NextResponse.json({
    offeredAt: updated.testStripOfferedByMakerAt!.toISOString(),
    alreadyOffered: false,
  });
}
