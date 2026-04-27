/**
 * Pickup verification tokens.
 *
 * Two-way design:
 *   - MAKER_TO_CREATOR (default): creator's phone shows the QR + 6-digit
 *     code; maker scans/types it at handover. This is the common path.
 *   - CREATOR_TO_MAKER: reverse fallback if the maker has no working camera —
 *     maker shows their token and the creator confirms it from inside the
 *     job page. Same DB row, opposite direction.
 *
 * Codes are 6 digits, zero-padded, ~1M space. Single-use, expire after 2h.
 * The QR encodes a deep-link URL `fabricate://pickup/<code>` so a generic QR
 * scanner shows a recognisable payload.
 */

import { randomInt } from "node:crypto";
import { prisma } from "./prisma";

export const PICKUP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export type PickupDirection = "MAKER_TO_CREATOR" | "CREATOR_TO_MAKER";

function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function pickupQrPayload(code: string): string {
  return `fabricate://pickup/${code}`;
}

/**
 * Mint a fresh pickup token. Invalidates any prior unconsumed tokens for the
 * same direction so we never have two valid codes at once.
 */
export async function mintPickupToken(opts: {
  jobId: string;
  direction?: PickupDirection;
}) {
  const direction = opts.direction ?? "MAKER_TO_CREATOR";
  // Invalidate prior unconsumed tokens for this direction by setting expiry to now.
  await prisma.pickupToken.updateMany({
    where: { jobId: opts.jobId, direction, consumedAt: null },
    data: { expiresAt: new Date() },
  });

  // Retry on collision (cuid for id, but the human code can collide).
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    try {
      const tok = await prisma.pickupToken.create({
        data: {
          jobId: opts.jobId,
          code,
          direction,
          expiresAt: new Date(Date.now() + PICKUP_TTL_MS),
        },
      });
      return tok;
    } catch {
      // unique violation on `code` — try again
    }
  }
  throw new Error("could not mint pickup token after retries");
}

/**
 * Consume a token if it's valid (right job, right direction, unconsumed,
 * unexpired). Returns the token row on success or null if invalid.
 */
export async function consumePickupToken(opts: {
  code: string;
  consumedBy: string; // userId
  expectedJobId?: string;
  expectedDirection?: PickupDirection;
}) {
  const tok = await prisma.pickupToken.findUnique({
    where: { code: opts.code },
  });
  if (!tok) return null;
  if (tok.consumedAt) return null;
  if (tok.expiresAt < new Date()) return null;
  if (opts.expectedJobId && tok.jobId !== opts.expectedJobId) return null;
  if (opts.expectedDirection && tok.direction !== opts.expectedDirection) return null;

  // Race-safe: only update if still unconsumed.
  const result = await prisma.pickupToken.updateMany({
    where: { id: tok.id, consumedAt: null },
    data: { consumedAt: new Date(), consumedBy: opts.consumedBy },
  });
  if (result.count === 0) return null;

  return prisma.pickupToken.findUnique({ where: { id: tok.id } });
}
