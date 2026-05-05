import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordJobEvent } from "@/lib/jobs";
import { notifyBidPlaced } from "@/lib/notifications";
import { isMakerVerified } from "@/lib/maker-verification";
import { notify } from "@/lib/notify";
import { selectBestPrinter } from "@/lib/printers";

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

  if (!(await isMakerVerified(profile.id)))
    return NextResponse.json(
      { error: "verification required: complete /maker/verification before bidding" },
      { status: 403 },
    );

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

  // Maker-bid floor. Bids must leave the platform's cut intact, so the
  // bid must be strictly greater than the platformFeePence snapshotted at
  // job creation. The maker can still erode their own machine-time and
  // material costs — that's what's between this floor and the listed
  // price.
  if (parsed.data.priceOfferPence <= job.platformFeePence) {
    return NextResponse.json(
      {
        error: `Bid (£${(parsed.data.priceOfferPence / 100).toFixed(2)}) must be at least £${((job.platformFeePence + 1) / 100).toFixed(2)} so the platform fee is preserved.`,
      },
      { status: 400 },
    );
  }
  if (parsed.data.priceOfferPence > job.quotedPricePence) {
    return NextResponse.json(
      {
        error: `Bid cannot exceed the creator's listed price (£${(job.quotedPricePence / 100).toFixed(2)}).`,
      },
      { status: 400 },
    );
  }

  // Auto-select the maker's highest-priority active printer that can
  // fulfil this job. The bid is rejected if no printer matches — keeps
  // creators from accepting bids the maker can't actually print.
  // Parse the JSON-encoded list of alternative materials the creator
  // ranked. Maker can win the bid if any printer matches any of them.
  let jobMaterialAlternatives: string[] = [];
  try {
    const parsed = JSON.parse(job.materialAlternatives ?? "[]");
    if (Array.isArray(parsed)) {
      jobMaterialAlternatives = parsed.filter(
        (x): x is string => typeof x === "string",
      );
    }
  } catch {
    // bad JSON, just treat as no alternatives
  }
  const printer = await selectBestPrinter({
    makerId: profile.id,
    jobMaterial: job.material,
    jobMaterialAlternatives,
    isMultiMaterial: job.isMultiMaterial,
  });
  if (!printer) {
    return NextResponse.json(
      {
        error:
          "None of your active printers match this job's material/AMS requirements. Add or activate a printer that stocks this material in your maker profile.",
      },
      { status: 400 },
    );
  }

  const bid = await prisma.jobBid.upsert({
    where: { jobId_makerId: { jobId: job.id, makerId: profile.id } },
    update: {
      priceOfferPence: parsed.data.priceOfferPence,
      etaHours: parsed.data.etaHours,
      message: parsed.data.message ?? null,
      status: "PENDING",
      printerId: printer.id,
    },
    create: {
      jobId: job.id,
      makerId: profile.id,
      priceOfferPence: parsed.data.priceOfferPence,
      etaHours: parsed.data.etaHours,
      message: parsed.data.message ?? null,
      printerId: printer.id,
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

  await notify({
    recipientId: job.creatorId,
    kind: "bid_placed",
    body: `${profile.displayName} bid £${(parsed.data.priceOfferPence / 100).toFixed(2)} on ${job.fileName}.`,
    link: `/jobs/${job.id}`,
    data: { jobId: job.id, bidId: bid.id, priceOfferPence: parsed.data.priceOfferPence },
  });

  return NextResponse.json({ bid });
}
