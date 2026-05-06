import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  checkPasswordStrength,
} from "@/lib/passwords";
import { lookupAuthToken, consumeAuthToken } from "@/lib/auth-tokens";

export const runtime = "nodejs";

const Schema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/auth/reset-password — consume a reset token and set a
 * new password. Single-use tokens; the user's email is also marked
 * as verified at this point (they proved access to the inbox).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { token, password } = parsed.data;

  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.reason }, { status: 400 });
  }

  const row = await lookupAuthToken({ token, purpose: "reset_password" });
  if (!row) {
    return NextResponse.json(
      {
        error:
          "Reset link is expired or already used. Request a new one from /account/forgot-password.",
      },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { email: row.email },
    data: {
      passwordHash,
      // Reset proves inbox ownership, so we treat this as verification too.
      emailVerified: new Date(),
    },
  });
  await consumeAuthToken(token);
  return NextResponse.json({ ok: true, email: row.email });
}
