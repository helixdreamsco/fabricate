/**
 * Issuance and redemption helpers for email-verification and
 * password-reset tokens. Both flows share the AuthToken table; they
 * differ only by `purpose`.
 *
 * Use the high-level helpers below — they enforce single-use, time-
 * bounded redemption and clean up old tokens in the same transaction.
 */

import { prisma } from "./prisma";
import { generateAuthToken } from "./passwords";

export type AuthTokenPurpose = "verify_email" | "reset_password";

export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Mint a new token for the given email + purpose. Invalidates any prior
 * unconsumed tokens of the same purpose for the same email so a fresh
 * "resend" always supersedes the previous one (no stale links lurking).
 */
export async function issueAuthToken(opts: {
  email: string;
  purpose: AuthTokenPurpose;
  ttlMs?: number;
}): Promise<{ token: string; expires: Date }> {
  const ttl =
    opts.ttlMs ??
    (opts.purpose === "verify_email"
      ? VERIFY_EMAIL_TTL_MS
      : RESET_PASSWORD_TTL_MS);
  const expires = new Date(Date.now() + ttl);
  const token = generateAuthToken();
  await prisma.$transaction([
    prisma.authToken.deleteMany({
      where: {
        email: opts.email,
        purpose: opts.purpose,
        consumed: false,
      },
    }),
    prisma.authToken.create({
      data: {
        token,
        email: opts.email,
        purpose: opts.purpose,
        expires,
      },
    }),
  ]);
  return { token, expires };
}

/**
 * Look up an unconsumed, unexpired token of the given purpose. Returns
 * the row (with email) if valid, or null if the token is missing,
 * already consumed, expired, or for a different purpose.
 */
export async function lookupAuthToken(opts: {
  token: string;
  purpose: AuthTokenPurpose;
}) {
  const row = await prisma.authToken.findUnique({
    where: { token: opts.token },
  });
  if (!row) return null;
  if (row.purpose !== opts.purpose) return null;
  if (row.consumed) return null;
  if (row.expires.getTime() < Date.now()) return null;
  return row;
}

/** Mark a token as consumed. Idempotent. */
export async function consumeAuthToken(token: string) {
  await prisma.authToken.update({
    where: { token },
    data: { consumed: true },
  });
}
