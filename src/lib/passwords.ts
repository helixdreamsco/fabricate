/**
 * Password hashing + token generation primitives for email/password auth.
 *
 * - Hash: bcryptjs with cost 12 (good default for 2026).
 * - Tokens: 32 bytes of crypto-random, hex-encoded → 64 chars.
 *
 * Edge runtime can't import this (bcryptjs isn't Edge-safe); only
 * Node-runtime route handlers should use these helpers.
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Cryptographically random 64-char hex string. */
export function generateAuthToken(): string {
  return randomBytes(32).toString("hex");
}

/** Minimum-strength check. Keep simple to avoid silly rejection of real
 *  passwords — modern guidance says length matters more than character-class
 *  rules. We require 10+ chars and reject only the most obvious weak strings. */
export function checkPasswordStrength(plain: string): {
  ok: boolean;
  reason?: string;
} {
  if (plain.length < 10) {
    return { ok: false, reason: "Password must be at least 10 characters." };
  }
  if (plain.length > 200) {
    return { ok: false, reason: "Password is too long (max 200)." };
  }
  const lower = plain.toLowerCase();
  const blacklist = [
    "password",
    "12345678",
    "1234567890",
    "qwerty",
    "letmein",
    "abc123",
    "iloveyou",
  ];
  if (blacklist.some((w) => lower.includes(w))) {
    return {
      ok: false,
      reason: "That password is too common. Pick something less guessable.",
    };
  }
  return { ok: true };
}
