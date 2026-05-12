import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  checkPasswordStrength,
} from "@/lib/passwords";
import { issueAuthToken } from "@/lib/auth-tokens";
import { notifyVerifyEmail } from "@/lib/notifications";
import {
  AFFILIATE_COOKIE,
  attachCodeOnce,
  lookupCodeForRedemption,
  normaliseCode,
} from "@/lib/affiliate";

export const runtime = "nodejs";

const SignUpSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(80).optional().nullable(),
  // Optional affiliate code. If invalid or self-owned it's silently
  // ignored — we don't want signup to fail because someone fat-fingered
  // a referral code.
  affiliateCode: z.string().trim().min(1).max(48).optional().nullable(),
});

/**
 * POST /api/auth/signup — create a new email/password account.
 *
 * To avoid leaking which emails are registered we always respond
 * 200 with the same shape, regardless of whether the email already
 * exists. Internally:
 *
 *   - new email: create User, hash password, mint verify token, send email.
 *   - existing email with no passwordHash (Google-only): set passwordHash
 *     and re-send verification (this lets the same user add a password).
 *   - existing email already verified with passwordHash: silently send a
 *     "someone tried to sign up as you" email — actually we just no-op
 *     and return success. The legitimate user already has access.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = SignUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { email, password, name, affiliateCode } = parsed.data;

  // Read the cookie too — set when the visitor lands via /r/<code>. The
  // form value (if explicitly entered) takes precedence over the cookie.
  const cookieStore = await cookies();
  const codeFromCookie = cookieStore.get(AFFILIATE_COOKIE)?.value ?? null;
  const codeCandidate =
    (affiliateCode && normaliseCode(affiliateCode)) ||
    (codeFromCookie && normaliseCode(codeFromCookie)) ||
    null;

  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.reason }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && existing.passwordHash && existing.emailVerified) {
    // Already a fully-verified account — don't say so (would leak
    // existence). Pretend success without changing anything.
    return NextResponse.json({ ok: true });
  }

  let userId: string;
  if (existing) {
    // User row exists (probably from Google OAuth) — set / refresh their
    // password and re-issue the verification.
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        // Don't overwrite a name they already chose unless they gave us one.
        ...(name && !existing.name ? { name } : {}),
      },
    });
    userId = existing.id;
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        name: name ?? null,
        passwordHash,
      },
    });
    userId = created.id;
  }

  // Attempt affiliate attachment. Only lands for users with no prior
  // redemption — so re-running signup for an existing Google user
  // doesn't reassign their referrer.
  if (codeCandidate) {
    const lookup = await lookupCodeForRedemption(codeCandidate, userId);
    if (lookup.ok) {
      await attachCodeOnce(userId, lookup.codeId);
    }
    // Clear the cookie either way — we've made our attempt.
    cookieStore.delete(AFFILIATE_COOKIE);
  }

  const { token } = await issueAuthToken({ email, purpose: "verify_email" });
  notifyVerifyEmail({ email, token, displayName: name ?? null });

  return NextResponse.json({ ok: true });
}
