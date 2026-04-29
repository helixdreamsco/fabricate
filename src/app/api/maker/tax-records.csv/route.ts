import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ukTaxYearBounds, currentUkTaxYear, formatTaxYearLabel } from "@/lib/tax";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return new Response("unauthorized", { status: 401 });
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) return new Response("no maker profile", { status: 400 });

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
      payment: { select: { job: { select: { id: true, fileName: true } } } },
    },
  });

  const header = [
    "captured_at",
    "job_id",
    "file_name",
    "gross_pence",
    "platform_fee_net_pence",
    "platform_fee_vat_pence",
    "maker_payout_pence",
    "vat_rate",
  ].join(",");
  const rows = records.map((r) => {
    const file = (r.payment.job.fileName ?? "").replace(/"/g, '""');
    return [
      r.capturedAt.toISOString(),
      r.payment.job.id,
      `"${file}"`,
      r.grossPence,
      r.platformFeeNetPence,
      r.platformFeeVatPence,
      r.makerPayoutPence,
      r.vatRate.toFixed(2),
    ].join(",");
  });
  const csv = [header, ...rows].join("\n") + "\n";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fabricate-tax-${formatTaxYearLabel(taxYear)}.csv"`,
    },
  });
}
