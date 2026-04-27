/**
 * Money is stored in pence everywhere on the server / DB.
 * UI converts at the edge with these helpers.
 */

export function poundsToPence(p: number): number {
  return Math.round(p * 100);
}

export function penceToPounds(p: number): number {
  return p / 100;
}

export function formatGbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

/** Default platform fee: 8% of quoted price, minimum 50p. */
export function platformFeePenceFor(amountPence: number): number {
  return Math.max(50, Math.round(amountPence * 0.08));
}

/** Default fee a creator pays to require a completion photo from the
 *  maker before pickup. Forwarded to the maker as a payout bonus. */
export const COMPLETION_PHOTO_FEE_PENCE = 200;

/** Effective completion-photo fee for a given (job, maker) pair. Waived
 *  when the maker has opted into offering the service free. */
export function effectiveCompletionPhotoFee(
  job: { requireCompletionPhoto: boolean; completionPhotoFeePence: number },
  maker: { freeCompletionPhoto: boolean } | null,
): number {
  if (!job.requireCompletionPhoto) return 0;
  if (maker?.freeCompletionPhoto) return 0;
  return job.completionPhotoFeePence;
}
