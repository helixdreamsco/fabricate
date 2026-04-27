import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { transitionJob, recordJobEvent } from "@/lib/jobs";
import { refund } from "@/lib/payments";
import { notifyJobCancelled } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/jobs/:id/cancel — creator cancels a job.
 *
 * Allowed from: OPEN, ASSIGNED, IN_PROGRESS. After IN_PROGRESS we still allow
 * cancel but flag that the maker may have incurred costs (no auto-deduct in
 * v1 — that's a dispute, route is left open). If a Payment exists, refund it.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: { payment: true },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.creatorId !== session.user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(job.status)) {
    return NextResponse.json(
      { error: `cannot cancel from status ${job.status}` },
      { status: 400 }
    );
  }

  // Refund any captured payment.
  if (job.payment && job.payment.status === "CAPTURED" && job.payment.stripePaymentIntentId) {
    const r = await refund({
      paymentIntentId: job.payment.stripePaymentIntentId,
      reason: "requested_by_customer",
    });
    await prisma.payment.update({
      where: { id: job.payment.id },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
    await recordJobEvent({
      jobId: job.id,
      actor: "system",
      kind: "payment_refunded",
      body: `Payment refunded (${r.mode === "sim" ? "TEST MODE" : "live"}).`,
      data: { refundId: r.refundId },
    });
  }

  await transitionJob({
    jobId: job.id,
    to: "CANCELLED",
    actor: "creator",
    actorId: session.user.id,
    body: `${job.status} → CANCELLED`,
  });

  // Notify the assigned maker, if any (no-op for OPEN-state cancellations).
  if (job.assignedMakerId) {
    const m = await prisma.makerProfile.findUnique({
      where: { id: job.assignedMakerId },
      include: { user: { select: { email: true } } },
    });
    if (m) {
      notifyJobCancelled({
        recipientEmail: m.user.email,
        recipientName: m.displayName,
        jobId: job.id,
        fileName: job.fileName,
        byParty: "creator",
        refunded: !!job.payment && job.payment.status === "CAPTURED",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
