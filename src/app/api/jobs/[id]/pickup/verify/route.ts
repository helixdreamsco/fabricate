import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { consumePickupToken } from "@/lib/pickup";
import { transitionJob, recordJobEvent } from "@/lib/jobs";
import { transferToMaker } from "@/lib/payments";
import { notifyPickupVerified } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

/**
 * POST /api/jobs/:id/pickup/verify — verify a pickup code at handover.
 *
 * Either party may call this depending on token direction:
 *   - MAKER_TO_CREATOR token: maker enters/scans creator's code (default).
 *   - CREATOR_TO_MAKER token: creator enters maker's code (fallback).
 *
 * On success: mark token consumed, transition job → PICKED_UP, fire a
 * Transfer to the maker's Stripe Connect account, write Payout row + events.
 *
 * Job auto-COMPLETES on successful pickup verification — there's no
 * post-pickup work in the v1 flow. (Disputes can still re-open via the
 * separate dispute path which we'll wire later.)
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "code must be 6 digits" }, { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      assignedMaker: { select: { id: true, userId: true, stripeAccountId: true, displayName: true } },
      payment: true,
    },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.status !== "READY_FOR_PICKUP")
    return NextResponse.json(
      { error: `job not ready for pickup (status: ${job.status})` },
      { status: 400 }
    );

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  const isCreator = job.creatorId === session.user.id;
  const isAssignedMaker = profile && job.assignedMakerId === profile.id;
  if (!isCreator && !isAssignedMaker)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Match token direction to which party is calling:
  //   maker  → consuming a MAKER_TO_CREATOR token (creator's code)
  //   creator → consuming a CREATOR_TO_MAKER token (maker's code)
  const expectedDirection = isAssignedMaker ? "MAKER_TO_CREATOR" : "CREATOR_TO_MAKER";

  const token = await consumePickupToken({
    code: parsed.data.code,
    consumedBy: session.user.id,
    expectedJobId: job.id,
    expectedDirection,
  });
  if (!token)
    return NextResponse.json(
      { error: "code invalid, expired, or already used" },
      { status: 400 }
    );

  if (!job.assignedMaker || !job.payment) {
    return NextResponse.json(
      { error: "internal: job missing maker or payment" },
      { status: 500 }
    );
  }

  // Transfer captured funds (minus platform fee) to the maker's connected
  // account. In sim mode this just writes a sim_tr_* id.
  const payoutAmount = job.payment.amountPence - job.payment.platformFeePence;
  let transferId: string | null = null;
  let transferMode: "live" | "sim" = "sim";
  let transferError: string | null = null;
  if (job.assignedMaker.stripeAccountId) {
    try {
      const t = await transferToMaker({
        amountPence: payoutAmount,
        destinationAccountId: job.assignedMaker.stripeAccountId,
        sourceChargeId: job.payment.stripeChargeId ?? undefined,
        description: `Fabricate payout — job ${job.id}`,
      });
      transferId = t.transferId;
      transferMode = t.mode;
    } catch (e: unknown) {
      transferError = e instanceof Error ? e.message : String(e);
    }
  } else {
    transferError = "maker has no connected account on file";
  }

  await prisma.payout.create({
    data: {
      paymentId: job.payment.id,
      makerId: job.assignedMaker.id,
      amountPence: payoutAmount,
      stripeTransferId: transferId,
      status: transferError ? "FAILED" : "PAID",
      mode: transferMode,
      paidAt: transferError ? null : new Date(),
      failureReason: transferError,
    },
  });

  await recordJobEvent({
    jobId: job.id,
    actor: "system",
    kind: "pickup_verified",
    body: isAssignedMaker
      ? "Pickup confirmed by maker."
      : "Pickup confirmed by creator (reverse code).",
    data: { direction: token.direction },
  });

  await transitionJob({
    jobId: job.id,
    to: "PICKED_UP",
    actor: isCreator ? "creator" : "maker",
    actorId: session.user.id,
    body: "READY_FOR_PICKUP → PICKED_UP",
  });

  await recordJobEvent({
    jobId: job.id,
    actor: "system",
    kind: "payout_released",
    body: transferError
      ? `Payout failed: ${transferError}`
      : transferMode === "sim"
        ? `Payout released to ${job.assignedMaker.displayName} (£${(payoutAmount / 100).toFixed(2)}, TEST MODE).`
        : `Payout released to ${job.assignedMaker.displayName} (£${(payoutAmount / 100).toFixed(2)}).`,
    data: { amountPence: payoutAmount, mode: transferMode, failed: !!transferError },
  });

  // Auto-complete on successful pickup. Disputes can re-open later via a
  // dedicated route (not built in v1).
  await transitionJob({
    jobId: job.id,
    to: "COMPLETED",
    actor: "system",
    body: "PICKED_UP → COMPLETED",
  });

  // Notify both parties.
  const creator = await prisma.user.findUnique({
    where: { id: job.creatorId },
    select: { name: true, email: true },
  });
  const makerUser = await prisma.user.findUnique({
    where: { id: job.assignedMaker.userId },
    select: { email: true },
  });
  notifyPickupVerified({
    creatorEmail: creator?.email ?? null,
    creatorName: creator?.name ?? "there",
    makerEmail: makerUser?.email ?? null,
    makerDisplayName: job.assignedMaker.displayName,
    jobId: job.id,
    fileName: job.fileName,
    payoutAmountPence: payoutAmount,
  });

  return NextResponse.json({ ok: true, payoutAmountPence: payoutAmount, payoutMode: transferMode });
}
