import { Card } from "@/components/ui/Card";
import { prisma } from "@/lib/prisma";
import { formatGbp } from "@/lib/money";
import {
  ukTaxYearBounds,
  currentUkTaxYear,
  formatTaxYearLabel,
} from "@/lib/tax";

const UK_TRADING_ALLOWANCE_PENCE = 100_000; // £1,000

/** Maker earnings + tax-year totals for the dashboard. Server component. */
export async function MakerEarningsCard({ makerId }: { makerId: string }) {
  const taxYear = currentUkTaxYear();
  const { start, end } = ukTaxYearBounds(taxYear);

  const records = await prisma.taxRecord.findMany({
    where: {
      capturedAt: { gte: start, lte: end },
      payment: { job: { assignedMakerId: makerId } },
    },
  });
  const totalPayoutPence = records.reduce((s, r) => s + r.makerPayoutPence, 0);
  const totalGrossPence = records.reduce((s, r) => s + r.grossPence, 0);
  const totalVatPence = records.reduce((s, r) => s + r.platformFeeVatPence, 0);

  const allowanceUsedPct = Math.min(
    100,
    Math.round((totalPayoutPence / UK_TRADING_ALLOWANCE_PENCE) * 100),
  );
  const allowanceRemaining = Math.max(
    0,
    UK_TRADING_ALLOWANCE_PENCE - totalPayoutPence,
  );

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
          Earnings · UK tax year {formatTaxYearLabel(taxYear)}
        </div>
        <a
          href={`/api/maker/tax-records.csv?taxYear=${taxYear}`}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black underline"
        >
          Download CSV
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/55 mb-1">
            Net to you
          </div>
          <div className="text-2xl font-black tabular-nums">
            {formatGbp(totalPayoutPence)}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mt-0.5">
            {records.length} job{records.length === 1 ? "" : "s"}
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/55 mb-1">
            Customer paid
          </div>
          <div className="text-lg font-bold tabular-nums">
            {formatGbp(totalGrossPence)}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mt-0.5">
            inc. {formatGbp(totalVatPence)} platform VAT
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
            HMRC trading allowance
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/65 tabular-nums">
            {formatGbp(allowanceRemaining)} left of £1,000
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
          <div
            className={
              allowanceUsedPct < 80
                ? "h-full bg-emerald-500"
                : "h-full bg-amber-500"
            }
            style={{ width: `${allowanceUsedPct}%` }}
          />
        </div>
        <p className="text-[12px] font-light text-black/55 mt-2 leading-snug">
          Below £1,000 you can use HMRC&rsquo;s trading allowance and skip
          self-assessment. Above it you must declare. CSV above is what you
          need.
        </p>
      </div>
    </Card>
  );
}
