/**
 * Active marketing promotions. Currently a single launch promo that
 * waives Fabricate's two platform fees (the creator-visible service fee
 * and the maker-side platform cut on payouts). Maker payouts and creator
 * VAT / courier / completion-photo fees are unaffected.
 *
 * Toggle via NEXT_PUBLIC_PROMO_NO_FEE=true. Public env var so the same
 * helper resolves correctly on both client and server — required because
 * pricing.ts runs in both contexts.
 */

export const PROMO_LABEL = "Launch promo";
export const PROMO_TAGLINE = "Limited time only";
export const PROMO_HEADLINE = "Launch promo · No service fees";
export const PROMO_BLURB =
  "Fabricate's £2 + 10% service fee is waived for a limited time. You pay only your maker's quote, plus any add-ons you choose.";

export function isPlatformFeePromoActive(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.NEXT_PUBLIC_PROMO_NO_FEE === "true";
}
