import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Schema = z.object({
  email: z.string().email().max(254),
  kind: z.enum(["auto_print"]),
});

export async function POST(req: Request) {
  // Public endpoint — heavily rate-limited to deter wait-list spam.
  if (!checkRateLimit({ key: rateLimitKey(req), limit: 5, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: "rate limited — try again in a minute" },
      { status: 429 },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  const email = parsed.data.email.toLowerCase().trim();
  try {
    await prisma.waitlistEntry.upsert({
      where: { email_kind: { email, kind: parsed.data.kind } },
      update: {},
      create: { email, kind: parsed.data.kind },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
