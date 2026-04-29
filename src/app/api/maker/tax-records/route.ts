import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ukTaxYearBounds, currentUkTaxYear } from "@/lib/tax";

export const runtime = "nodejs";

/**
 * GET /api/maker/tax-records?taxYear=2026
 * Returns all TaxRecord rows for the requesting maker's assigned jobs in
 * the given UK tax year (start year).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile)
    return NextResponse.json({ error: "no maker profile" }, { status: 400 });

  const url = new URL(req.url);
  const taxYearParam = url.searchParams.get("taxYear");
  const taxYear = taxYearParam
    ? parseInt(taxYearParam, 10)
    : currentUkTaxYear();
  const { start, end } = ukTaxYearBounds(taxYear);

  const records = await prisma.taxRecord.findMany({
    where: {
      capturedAt: { gte: start, lte: end },
      payment: { job: { assignedMakerId: profile.id } },
    },
    orderBy: { capturedAt: "asc" },
    include: {
      payment: {
        select: {
          id: true,
          job: { select: { id: true, fileName: true } },
        },
      },
    },
  });

  const totalGross = records.reduce((s, r) => s + r.grossPence, 0);
  const totalPayout = records.reduce((s, r) => s + r.makerPayoutPence, 0);

  return NextResponse.json({
    taxYear,
    bounds: { start: start.toISOString(), end: end.toISOString() },
    totalGrossPence: totalGross,
    totalPayoutPence: totalPayout,
    records: records.map((r) => ({
      id: r.id,
      capturedAt: r.capturedAt.toISOString(),
      jobId: r.payment.job.id,
      fileName: r.payment.job.fileName,
      grossPence: r.grossPence,
      platformFeeNetPence: r.platformFeeNetPence,
      platformFeeVatPence: r.platformFeeVatPence,
      makerPayoutPence: r.makerPayoutPence,
    })),
  });
}
