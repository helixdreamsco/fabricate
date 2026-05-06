import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueAuthToken } from "@/lib/auth-tokens";
import { notifyPasswordReset } from "@/lib/notifications";

export const runtime = "nodejs";

const Schema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
});

/**
 * POST /api/auth/forgot-password — request a password-reset email.
 *
 * Always returns 200 regardless of whether the email exists, to avoid
 * leaking account presence. The reset email is only sent if the email
 * actually maps to a User row.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    // Even on bad input return ok: true (privacy). Just don't issue.
    return NextResponse.json({ ok: true });
  }
  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const { token } = await issueAuthToken({ email, purpose: "reset_password" });
    notifyPasswordReset({ email, token, displayName: user.name });
  }
  return NextResponse.json({ ok: true });
}
