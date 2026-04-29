import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordJobEvent } from "@/lib/jobs";
import { paymentMode, simCaptured, verifyCapturedIntent, type CapturedIntent } from "@/lib/payments";
import { effectiveCompletionPhotoFee } from "@/lib/money";
import { notifyBidAccepted, notifyBidDeclined } from "@/lib/notifications";

type Params = { params: Promise<{ id: string; bidId: string }> };

const AcceptSchema = z.object({
  /** Required in live mode. The id of the PaymentIntent the client just
   *  confirmed via Stripe Elements. We retrieve it server-side and verify
   *  it's `succeeded` + matches the bid amount before assigning the maker. */
  paymentIntentId: z.string().optional().nullable(),
});

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, bidId } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  if (job.creatorId !== session.user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (job.status !== "OPEN")
    return NextResponse.json({ error: "job not open" }, { status: 400 });

  const bid = await prisma.jobBid.findUnique({
    where: { id: bidId },
    include: { maker: true },
  });
  if (!bid || bid.jobId !== job.id)
    return NextResponse.json({ error: "bid not found" }, { status: 404 });
  if (bid.status !== "PENDING")
    return NextResponse.json({ error: "bid not pending" }, { status: 400 });

  const mode = paymentMode();

  if (mode === "live" && !bid.maker.stripeOnboarded) {
    return NextResponse.json(
      { error: "maker has not completed payout onboarding" },
      { status: 400 },
    );
  }

  const parsed = AcceptSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });

  // Photo-fee waiver: maker may have opted to offer the service free, in
  // which case we don't charge the creator the extra. Computed once here
  // and used for both Stripe verification and the persisted Payment row.
  const photoFee = effectiveCompletionPhotoFee(job, bid.maker);
  const totalAmount = bid.priceOfferPence + photoFee;

  // Resolve the captured-payment record we'll persist. In live mode that
  // means verifying the PaymentIntent the client confirmed via Elements; in
  // sim mode we mint synthetic ids without any network round-trip.
  let captured: CapturedIntent;
  if (mode === "live") {
    if (!parsed.data.paymentIntentId) {
      return NextResponse.json(
        { error: "paymentIntentId required in live mode" },
        { status: 400 },
      );
    }
    try {
      captured = await verifyCapturedIntent({
        paymentIntentId: parsed.data.paymentIntentId,
        expectedAmountPence: totalAmount,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "payment verification failed" },
        { status: 400 },
      );
    }
  } else {
    captured = { ...simCaptured(), amountPence: totalAmount };
  }

  // Idempotency guard: if we've already created a Payment for this intent
  // (e.g. client retried after a flaky network), return the existing record
  // rather than double-assigning.
  if (captured.paymentIntentId) {
    const existing = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: captured.paymentIntentId },
    });
    if (existing) {
      return NextResponse.json({
        job: await prisma.job.findUnique({ where: { id: job.id } }),
        payment: existing,
        mode: captured.mode,
        idempotent: true,
      });
    }
  }

  const platformFeePence = job.platformFeePence;
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        jobId: job.id,
        payerId: session.user!.id!,
        // amountPence is the *total* captured (bid + completion-photo fee
        // when applicable). platformFee only applies to the bid portion;
        // the photo fee passes through to the maker uncut.
        amountPence: totalAmount,
        platformFeePence,
        stripePaymentIntentId: captured.paymentIntentId,
        stripeChargeId: captured.chargeId,
        status: "CAPTURED",
        mode: captured.mode,
        authorizedAt: new Date(),
        capturedAt: new Date(),
      },
    });
    await tx.jobBid.update({
      where: { id: bid.id },
      data: { status: "ACCEPTED" },
    });
    await tx.jobBid.updateMany({
      where: { jobId: job.id, id: { not: bid.id }, status: "PENDING" },
      data: { status: "DECLINED" },
    });
    const updatedJob = await tx.job.update({
      where: { id: job.id },
      data: { assignedMakerId: bid.makerId, status: "ASSIGNED" },
    });
    return { payment, job: updatedJob };
  });

  await recordJobEvent({
    jobId: job.id,
    actor: "system",
    kind: "bid_accepted",
    body: `${bid.maker.displayName}'s bid was accepted.`,
    data: { bidId: bid.id, makerId: bid.makerId, amountPence: bid.priceOfferPence },
  });
  await recordJobEvent({
    jobId: job.id,
    actor: "system",
    kind: "payment_captured",
    body: `Payment captured (${captured.mode === "sim" ? "TEST MODE" : "Stripe test"}).`,
    data: {
      paymentId: result.payment.id,
      amountPence: bid.priceOfferPence,
      mode: captured.mode,
    },
  });
  await recordJobEvent({
    jobId: job.id,
    actor: "system",
    kind: "status_change",
    body: "OPEN → ASSIGNED",
    data: { from: "OPEN", to: "ASSIGNED" },
  });

  // Notifications: accepted maker + declined makers.
  const creator = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  const acceptedMakerUser = await prisma.user.findUnique({
    where: { id: bid.maker.userId },
    select: { email: true },
  });
  notifyBidAccepted({
    makerEmail: acceptedMakerUser?.email ?? null,
    makerDisplayName: bid.maker.displayName,
    jobId: job.id,
    fileName: job.fileName,
    creatorName: creator?.name ?? creator?.email ?? "The creator",
    priceOfferPence: bid.priceOfferPence,
    etaHours: bid.etaHours,
  });

  const { notify: doNotify } = await import("@/lib/notify");
  await doNotify({
    recipientId: bid.maker.userId,
    kind: "bid_accepted",
    body: `Your bid on ${job.fileName} was accepted (£${(bid.priceOfferPence / 100).toFixed(2)}).`,
    link: `/maker/jobs/${job.id}`,
    data: { jobId: job.id, bidId: bid.id },
  });

  // Snapshot tax record for HMRC reporting. Platform fee is treated as
  // VAT-inclusive at 20% UK rate; maker payout = gross - platform fee.
  const { captureTaxRecord } = await import("@/lib/tax");
  await captureTaxRecord({
    paymentId: result.payment.id,
    grossPence: result.payment.amountPence,
    platformFeeIncVatPence: result.payment.platformFeePence,
    makerPayoutPence: result.payment.amountPence - result.payment.platformFeePence,
  });

  const declinedBids = await prisma.jobBid.findMany({
    where: { jobId: job.id, status: "DECLINED", id: { not: bid.id } },
    include: { maker: { include: { user: { select: { email: true } } } } },
  });
  for (const d of declinedBids) {
    notifyBidDeclined({
      makerEmail: d.maker.user.email,
      makerDisplayName: d.maker.displayName,
      jobId: job.id,
      fileName: job.fileName,
      creatorName: creator?.name ?? creator?.email ?? "The creator",
    });
  }

  return NextResponse.json({
    job: result.job,
    payment: result.payment,
    mode: captured.mode,
  });
}
