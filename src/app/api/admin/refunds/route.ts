import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { issueRefund, RefundError } from "@/lib/refunds";

export const runtime = "nodejs";

const Schema = z.object({
  paymentId: z.string().min(1),
  amountPence: z.number().int().positive(),
  reason: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  try {
    const refund = await issueRefund({
      paymentId: parsed.data.paymentId,
      amountPence: parsed.data.amountPence,
      reason: parsed.data.reason ?? null,
      issuedByAdminId: session.user.id,
    });
    return NextResponse.json({ refund });
  } catch (err) {
    if (err instanceof RefundError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
