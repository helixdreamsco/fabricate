import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { lookupAuthToken, consumeAuthToken } from "@/lib/auth-tokens";

export const runtime = "nodejs";

const Schema = z.object({ token: z.string().min(32).max(128) });

/**
 * POST /api/auth/verify-email — consume a verification token.
 *
 * Marks the User.emailVerified timestamp on success. The client then
 * triggers a Credentials sign-in with the password the user already
 * supplied (signup flow keeps it cached client-side until verification
 * completes), so they land back signed in with no extra step.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }
  const row = await lookupAuthToken({
    token: parsed.data.token,
    purpose: "verify_email",
  });
  if (!row) {
    return NextResponse.json(
      { error: "Token expired or already used. Request a new verification email." },
      { status: 400 },
    );
  }
  await prisma.user.update({
    where: { email: row.email },
    data: { emailVerified: new Date() },
  });
  await consumeAuthToken(parsed.data.token);
  return NextResponse.json({ ok: true, email: row.email });
}
