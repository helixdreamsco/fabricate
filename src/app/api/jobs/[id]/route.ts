import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeJobEvent } from "@/lib/jobs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/jobs/:id
 *   Returns the job, its events, and (for the creator) bid list. Maker side
 *   gets their own bid only. Always includes status + maker info enough to
 *   render the page.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, image: true, email: true } },
      assignedMaker: {
        select: { id: true, displayName: true, userId: true, postcode: true, hasAMS: true, printerModel: true },
      },
      prioritizedMaker: { select: { id: true, displayName: true, userId: true } },
      payment: true,
    },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isCreator = job.creatorId === session.user.id;
  const isAssignedMaker = job.assignedMaker?.userId === session.user.id;

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, stripeOnboarded: true },
  });

  // Visibility: creator sees everything; assigned maker sees everything;
  // any registered maker can read OPEN jobs (so they can decide to bid).
  // Otherwise forbidden.
  const canViewAsMarketReader =
    !isCreator && !isAssignedMaker && job.status === "OPEN" && !!profile;
  if (!isCreator && !isAssignedMaker && !canViewAsMarketReader) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const events = await prisma.jobEvent.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "asc" },
  });

  let bids: unknown[] = [];
  let myBid: unknown = null;
  if (isCreator) {
    const all = await prisma.jobBid.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: {
        maker: {
          select: {
            id: true, displayName: true, postcode: true, hasAMS: true,
            printerModel: true, stripeOnboarded: true,
          },
        },
      },
    });
    bids = all;
  } else if (profile) {
    const mine = await prisma.jobBid.findFirst({
      where: { jobId: job.id, makerId: profile.id },
    });
    myBid = mine;
  }

  return NextResponse.json({
    job: {
      ...job,
      partColors: safeJsonArray(job.partColors),
    },
    events: events.map(serializeJobEvent),
    bids,
    myBid,
    viewer: {
      userId: session.user.id,
      isCreator,
      isAssignedMaker,
      makerProfileId: profile?.id ?? null,
      stripeOnboarded: profile?.stripeOnboarded ?? false,
    },
  });
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
