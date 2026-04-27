import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordJobEvent } from "@/lib/jobs";
import { notifyBidWithdrawn } from "@/lib/notifications";

type Params = { params: Promise<{ id: string; bidId: string }> };

/**
 * POST /api/jobs/:id/bids/:bidId/withdraw — maker withdraws their pending bid.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, bidId } = await params;

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile)
    return NextResponse.json({ error: "no maker profile" }, { status: 400 });

  const bid = await prisma.jobBid.findUnique({ where: { id: bidId } });
  if (!bid || bid.jobId !== id || bid.makerId !== profile.id)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (bid.status !== "PENDING")
    return NextResponse.json({ error: "bid not pending" }, { status: 400 });

  await prisma.jobBid.update({
    where: { id: bidId },
    data: { status: "WITHDRAWN" },
  });
  await recordJobEvent({
    jobId: id,
    actor: "maker",
    actorId: session.user.id,
    kind: "bid_withdrawn",
    body: `${profile.displayName} withdrew their bid.`,
    data: { bidId, makerId: profile.id },
  });

  const job = await prisma.job.findUnique({
    where: { id },
    include: { creator: { select: { name: true, email: true } } },
  });
  if (job) {
    notifyBidWithdrawn({
      creatorEmail: job.creator.email,
      creatorName: job.creator.name ?? "there",
      jobId: id,
      fileName: job.fileName,
      makerName: profile.displayName,
    });
  }

  return NextResponse.json({ ok: true });
}
