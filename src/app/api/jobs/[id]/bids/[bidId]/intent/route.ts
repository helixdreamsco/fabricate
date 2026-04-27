import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPaymentIntent, paymentMode } from "@/lib/payments";
import { effectiveCompletionPhotoFee } from "@/lib/money";

type Params = { params: Promise<{ id: string; bidId: string }> };

/**
 * POST /api/jobs/:id/bids/:bidId/intent
 *
 * Creates a Stripe PaymentIntent for the given bid amount so the creator's
 * client can mount the Payment Element and confirm. Doesn't change any
 * job/bid state — that happens in the accept route once Stripe confirms
 * the intent client-side.
 *
 * In sim mode we don't actually need this round-trip — the client should
 * just call /accept directly. The route still works in sim, returning a
 * sentinel client_secret, so the same UI code path can be used.
 */
export async function POST(_req: Request, { params }: Params) {
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

  const photoFee = effectiveCompletionPhotoFee(job, bid.maker);
  const totalAmount = bid.priceOfferPence + photoFee;

  const intent = await createPaymentIntent({
    amountPence: totalAmount,
    payerEmail: session.user.email,
    description: `Fabricate job ${job.id}`,
    metadata: {
      jobId: job.id,
      bidId: bid.id,
      makerId: bid.makerId,
      completionPhotoFeePence: String(photoFee),
    },
  });

  return NextResponse.json({
    mode: intent.mode,
    paymentIntentId: intent.paymentIntentId,
    clientSecret: intent.clientSecret,
    amountPence: totalAmount,
    completionPhotoFeePence: photoFee,
  });
}
