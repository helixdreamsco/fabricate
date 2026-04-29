/**
 * VAT and UK tax-year helpers. UK VAT is 20% standard rate; we apply it to
 * the platform service fee. The displayed quote treats the fee as
 * VAT-inclusive (customers see the all-in number); internally we split it
 * for HMRC reporting.
 */

export const VAT_RATE_UK = 0.20;

/**
 * Given an inclusive (gross) service fee in pence, return the net + VAT
 * components.
 *
 * net + vat = gross.  vat = round(gross * rate / (1 + rate)).
 */
export function platformFeeBreakdown(grossPence: number): {
  netPence: number;
  vatPence: number;
} {
  const vatPence = Math.round(
    (grossPence * VAT_RATE_UK) / (1 + VAT_RATE_UK),
  );
  return { netPence: grossPence - vatPence, vatPence };
}

/**
 * UK tax year: 6 April YYYY → 5 April (YYYY+1). Pass the start year.
 */
export function ukTaxYearBounds(startYear: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(startYear, 3, 6, 0, 0, 0)),
    // 5 April end of day
    end: new Date(Date.UTC(startYear + 1, 3, 5, 23, 59, 59, 999)),
  };
}

/** The current UK tax year (start year). 6 Apr is the boundary. */
export function currentUkTaxYear(now: Date = new Date()): number {
  const month = now.getUTCMonth(); // 0-indexed: 3 = April
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();
  if (month > 3 || (month === 3 && day >= 6)) return year;
  return year - 1;
}

export function formatTaxYearLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

import { prisma } from "./prisma";

/**
 * Persist a tax record on payment capture. Splits the platform fee into
 * net + VAT and snapshots the maker payout. Idempotent (TaxRecord has a
 * unique constraint on paymentId).
 */
export async function captureTaxRecord(opts: {
  paymentId: string;
  grossPence: number;
  platformFeeIncVatPence: number;
  makerPayoutPence: number;
}) {
  const { netPence, vatPence } = platformFeeBreakdown(opts.platformFeeIncVatPence);
  return prisma.taxRecord.upsert({
    where: { paymentId: opts.paymentId },
    update: {},
    create: {
      paymentId: opts.paymentId,
      grossPence: opts.grossPence,
      platformFeeNetPence: netPence,
      platformFeeVatPence: vatPence,
      makerPayoutPence: opts.makerPayoutPence,
      vatRate: VAT_RATE_UK,
    },
  });
}
