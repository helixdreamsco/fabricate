/**
 * Affiliate program — shared helpers.
 *
 * Lifecycle:
 *   1. Owner mints a shareable code (e.g. NOFEES-MILES) on their /affiliate
 *      dashboard. One code per user; codes are immutable once minted.
 *   2. New visitor lands on /r/<code> → we drop an `aff_code` cookie
 *      (30-day, HttpOnly) and redirect to /access.
 *   3. On signup (email or Google), we read the cookie and atomically
 *      attach the code to the new User row. Already-existing users can
 *      redeem one-time via /account/affiliate.
 *   4. On the user's first successful payment capture, we waive their
 *      fee and accrue the counterparty's fee to the affiliate's balance.
 *      Subsequent jobs behave normally (single-use).
 */

import { prisma } from "./prisma";

export const AFFILIATE_COOKIE = "aff_code";
export const AFFILIATE_COOKIE_TTL_DAYS = 30;
export const AFFILIATE_PAYOUT_THRESHOLD_PENCE = 2000; // £20
export const AFFILIATE_COLLISION_CONSOLATION_PENCE = 50; // 50p each, both sides

/** Codes are case-insensitive on input but stored uppercase. We only
 *  accept letters, digits, dash, and underscore so the URL form is
 *  unambiguous. 4–32 chars to leave room for personalised slugs. */
export function normaliseCode(input: string): string | null {
  const trimmed = input.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,32}$/.test(trimmed)) return null;
  return trimmed;
}

/** Validate that a code is redeemable by `userId`. Returns the code row
 *  or a reason string. */
export async function lookupCodeForRedemption(
  rawCode: string,
  userId: string,
): Promise<
  | { ok: true; codeId: string }
  | { ok: false; reason: "invalid_format" | "not_found" | "self" }
> {
  const code = normaliseCode(rawCode);
  if (!code) return { ok: false, reason: "invalid_format" };
  const row = await prisma.affiliateCode.findUnique({
    where: { code },
    select: { id: true, ownerId: true },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.ownerId === userId) return { ok: false, reason: "self" };
  return { ok: true, codeId: row.id };
}

/** Atomically attach an affiliate code to a user, but ONLY if they
 *  have never redeemed before. Returns whether the attachment landed. */
export async function attachCodeOnce(
  userId: string,
  codeId: string,
): Promise<boolean> {
  // The `updateMany` with `where: { referredByCodeId: null }` is the
  // race-safe form — if the row already has a code, the count is 0 and
  // we return false. One affiliate per user, forever.
  const result = await prisma.user.updateMany({
    where: { id: userId, referredByCodeId: null },
    data: { referredByCodeId: codeId },
  });
  return result.count === 1;
}
