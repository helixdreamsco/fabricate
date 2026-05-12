import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transferToMaker } from "@/lib/payments";
import { AFFILIATE_PAYOUT_THRESHOLD_PENCE } from "@/lib/affiliate";

export const runtime = "nodejs";

/**
 * Affiliate payout sweep — designed to be invoked by Cloud Scheduler
 * (or any cron) on a daily cadence. Iterates affiliate codes whose
 * balance has crossed the threshold AND have a verified Stripe Connect
 * Express account, and transfers the balance to the affiliate.
 *
 * Authentication: `Authorization: Bearer <AFFILIATE_PAYOUT_SECRET>`.
 * The secret is set in env; if unset, the endpoint refuses all calls
 * so we don't accidentally expose a payout trigger.
 *
 * Idempotency: each successful transfer creates an AffiliatePayout
 * row and atomically decrements the AffiliateCode balance by the
 * exact amount transferred. A retry with the same balance sees the
 * decremented amount and either pays the remainder or skips.
 */
export async function POST(req: Request) {
  const secret = process.env.AFFILIATE_PAYOUT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "payout sweep disabled (no secret configured)" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const candidates = await prisma.affiliateCode.findMany({
    where: {
      balancePence: { gte: AFFILIATE_PAYOUT_THRESHOLD_PENCE },
      stripeAccountId: { not: null },
      stripeOnboarded: true,
    },
    select: {
      id: true,
      code: true,
      balancePence: true,
      stripeAccountId: true,
    },
  });

  const results: Array<{
    codeId: string;
    code: string;
    amountPence: number;
    status: "PAID" | "FAILED";
    transferId?: string;
    error?: string;
  }> = [];

  for (const c of candidates) {
    if (!c.stripeAccountId) continue;
    const amount = c.balancePence;
    try {
      const transfer = await transferToMaker({
        amountPence: amount,
        destinationAccountId: c.stripeAccountId,
        description: `Fabricate affiliate payout · ${c.code}`,
      });

      await prisma.$transaction(async (tx) => {
        await tx.affiliatePayout.create({
          data: {
            codeId: c.id,
            amountPence: amount,
            status: "PAID",
            stripeTransferId: transfer.transferId,
            mode: transfer.mode,
            paidAt: new Date(),
          },
        });
        await tx.affiliateCode.update({
          where: { id: c.id },
          data: {
            balancePence: { decrement: amount },
            paidOutPence: { increment: amount },
          },
        });
      });

      results.push({
        codeId: c.id,
        code: c.code,
        amountPence: amount,
        status: "PAID",
        transferId: transfer.transferId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "transfer failed";
      await prisma.affiliatePayout.create({
        data: {
          codeId: c.id,
          amountPence: amount,
          status: "FAILED",
          failureReason: message.slice(0, 500),
        },
      });
      results.push({
        codeId: c.id,
        code: c.code,
        amountPence: amount,
        status: "FAILED",
        error: message,
      });
    }
  }

  return NextResponse.json({
    swept: results.length,
    results,
  });
}
