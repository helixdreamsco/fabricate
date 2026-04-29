import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { recordConsent } from "@/lib/legal";

export const runtime = "nodejs";

const Schema = z.object({
  acceptTerms: z.boolean(),
  acceptPrivacy: z.boolean(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  if (!parsed.data.acceptTerms || !parsed.data.acceptPrivacy) {
    return NextResponse.json(
      { error: "Both Terms and Privacy must be accepted." },
      { status: 400 },
    );
  }

  // x-forwarded-for is the canonical Vercel header; fall back to direct.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");
  const ua = req.headers.get("user-agent");

  await recordConsent({
    userId: session.user.id,
    acceptTerms: parsed.data.acceptTerms,
    acceptPrivacy: parsed.data.acceptPrivacy,
    ipAddress: ip,
    userAgent: ua,
  });

  return NextResponse.json({ ok: true });
}
