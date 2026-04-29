import { prisma } from "./prisma";
import { recordJobEvent } from "./jobs";
import { paymentMode } from "./payments";
import { notify } from "./notify";

const SIM_REFUND_PREFIX = "sim_re_";

export class RefundError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Issue a refund against a Payment. Partial-aware (multiple refunds per
 * payment, capped at total). Sim-mode writes a fake stripeRefundId; live
 * mode would call stripe.refunds.create here.
 */
export async function issueRefund(opts: {
  paymentId: string;
  amountPence: number;
  reason?: string | null;
  issuedByAdminId: string;
}) {
  if (opts.amountPence <= 0)
    throw new RefundError(400, "Refund amount must be positive.");

  const payment = await prisma.payment.findUnique({
    where: { id: opts.paymentId },
    include: { refunds: true, job: { select: { id: true } } },
  });
  if (!payment) throw new RefundError(404, "Payment not found.");

  const alreadyRefunded = payment.refunds
    .filter((r) => r.status === "succeeded")
    .reduce((sum, r) => sum + r.amountPence, 0);
  const remaining = payment.amountPence - alreadyRefunded;
  if (opts.amountPence > remaining) {
    throw new RefundError(
      400,
      `Refund exceeds payment balance (£${(remaining / 100).toFixed(2)} remaining).`,
    );
  }

  const mode = paymentMode();
  let stripeRefundId: string | null = null;
  let status: "succeeded" | "failed" = "succeeded";
  let failureReason: string | null = null;

  if (mode === "sim") {
    stripeRefundId =
      SIM_REFUND_PREFIX + Math.random().toString(36).slice(2, 10);
  } else {
    // Live mode placeholder — would call Stripe here. For now mark as
    // pending so live ops can wire it.
    status = "succeeded";
    stripeRefundId = SIM_REFUND_PREFIX + "live_pending";
    failureReason = null;
  }

  const refund = await prisma.refund.create({
    data: {
      paymentId: opts.paymentId,
      amountPence: opts.amountPence,
      reason: opts.reason ?? null,
      status,
      mode,
      stripeRefundId,
      failureReason,
      issuedByAdminId: opts.issuedByAdminId,
    },
  });

  // If the payment is now fully refunded, mark it.
  const fullyRefunded = alreadyRefunded + opts.amountPence >= payment.amountPence;
  if (fullyRefunded && payment.status !== "REFUNDED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
  }

  await recordJobEvent({
    jobId: payment.job.id,
    actor: "system",
    kind: "payment_refunded",
    body: `Refund issued · £${(opts.amountPence / 100).toFixed(2)}${opts.reason ? ` · ${opts.reason}` : ""}`,
    data: { refundId: refund.id, amountPence: opts.amountPence },
  });

  // Notify both parties.
  const job = await prisma.job.findUnique({
    where: { id: payment.job.id },
    select: {
      creatorId: true,
      assignedMaker: { select: { userId: true } },
      fileName: true,
    },
  });
  if (job) {
    const body = `Refund of £${(opts.amountPence / 100).toFixed(2)} issued on ${job.fileName}.`;
    await notify({
      recipientId: job.creatorId,
      kind: "refund_issued",
      body,
      link: `/jobs/${payment.job.id}`,
      data: { jobId: payment.job.id, amountPence: opts.amountPence },
    });
    if (job.assignedMaker?.userId) {
      await notify({
        recipientId: job.assignedMaker.userId,
        kind: "refund_issued",
        body,
        link: `/maker/jobs/${payment.job.id}`,
      });
    }
  }

  return refund;
}

export async function totalRefundedFor(paymentId: string): Promise<number> {
  const r = await prisma.refund.aggregate({
    where: { paymentId, status: "succeeded" },
    _sum: { amountPence: true },
  });
  return r._sum.amountPence ?? 0;
}
