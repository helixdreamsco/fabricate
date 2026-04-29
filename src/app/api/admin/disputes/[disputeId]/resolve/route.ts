import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { resolveDispute, DisputeError } from "@/lib/disputes";
import { issueRefund, RefundError } from "@/lib/refunds";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Schema = z.object({
  outcome: z.enum(["creator", "maker"]),
  note: z.string().max(500).optional().nullable(),
  refundAmountPence: z.number().int().nonnegative().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { disputeId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );

  try {
    const result = await resolveDispute({
      disputeId,
      outcome: parsed.data.outcome,
      note: parsed.data.note ?? null,
      resolvedByAdminId: session.user.id,
    });

    // If creator wins, issue a refund. Default to full payment amount if
    // no explicit amount supplied.
    if (parsed.data.outcome === "creator") {
      const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        include: { job: { select: { payment: true } } },
      });
      const payment = dispute?.job.payment;
      if (payment) {
        const amount = parsed.data.refundAmountPence ?? payment.amountPence;
        if (amount > 0) {
          await issueRefund({
            paymentId: payment.id,
            amountPence: amount,
            reason: parsed.data.note ?? "Dispute resolved in creator's favour",
            issuedByAdminId: session.user.id,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, jobStatus: result.jobStatus });
  } catch (err) {
    if (err instanceof DisputeError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof RefundError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
