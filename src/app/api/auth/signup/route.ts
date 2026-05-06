import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  checkPasswordStrength,
} from "@/lib/passwords";
import { issueAuthToken } from "@/lib/auth-tokens";
import { notifyVerifyEmail } from "@/lib/notifications";

export const runtime = "nodejs";

const SignUpSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(80).optional().nullable(),
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
  const { email, password, name } = parsed.data;

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
  } else {
    await prisma.user.create({
      data: {
        email,
        name: name ?? null,
        passwordHash,
      },
    });
  }

  const { token } = await issueAuthToken({ email, purpose: "verify_email" });
  notifyVerifyEmail({ email, token, displayName: name ?? null });

  return NextResponse.json({ ok: true });
}
