import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordJobEvent } from "@/lib/jobs";
import { notifyBidPlaced } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

const PlaceSchema = z.object({
  priceOfferPence: z.number().int().positive().max(10_000_00),
  etaHours: z.number().int().min(1).max(24 * 14),
  message: z.string().trim().max(1000).optional().nullable(),
});

/**
 * POST /api/jobs/:id/bids — maker places (or updates) their bid.
 *
 * Requires: signed in, MakerProfile exists. Stripe onboarding is NOT required
 * to bid — only required at accept time, so a not-yet-onboarded maker can
 * still queue interest while finishing onboarding.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile)
    return NextResponse.json({ error: "create a maker profile first" }, { status: 400 });

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  if (job.status !== "OPEN")
    return NextResponse.json({ error: "job no longer accepting bids" }, { status: 400 });
  if (job.creatorId === session.user.id)
    return NextResponse.json({ error: "cannot bid on your own job" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = PlaceSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );

  const bid = await prisma.jobBid.upsert({
    where: { jobId_makerId: { jobId: job.id, makerId: profile.id } },
    update: {
      priceOfferPence: parsed.data.priceOfferPence,
      etaHours: parsed.data.etaHours,
      message: parsed.data.message ?? null,
      status: "PENDING",
    },
    create: {
      jobId: job.id,
      makerId: profile.id,
      priceOfferPence: parsed.data.priceOfferPence,
      etaHours: parsed.data.etaHours,
      message: parsed.data.message ?? null,
    },
  });

  await recordJobEvent({
    jobId: job.id,
    actor: "maker",
    actorId: session.user.id,
    kind: "bid_placed",
    body: `${profile.displayName} placed a bid (£${(parsed.data.priceOfferPence / 100).toFixed(2)}, ETA ${parsed.data.etaHours}h).`,
    data: { bidId: bid.id, makerId: profile.id, priceOfferPence: parsed.data.priceOfferPence },
  });

  // Notify creator
  const creator = await prisma.user.findUnique({
    where: { id: job.creatorId },
    select: { name: true, email: true },
  });
  const bidsCount = await prisma.jobBid.count({
    where: { jobId: job.id, status: "PENDING" },
  });
  notifyBidPlaced({
    creatorEmail: creator?.email ?? null,
    creatorName: creator?.name ?? "there",
    jobId: job.id,
    fileName: job.fileName,
    makerName: profile.displayName,
    priceOfferPence: parsed.data.priceOfferPence,
    etaHours: parsed.data.etaHours,
    message: parsed.data.message ?? null,
    bidsCountAfter: bidsCount,
  });

  return NextResponse.json({ bid });
}
