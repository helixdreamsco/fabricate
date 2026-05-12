import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normaliseCode } from "@/lib/affiliate";

export const runtime = "nodejs";

const Body = z.object({
  code: z.string().trim().min(1).max(48),
});

/**
 * POST /api/affiliate/code — mint the signed-in user's affiliate code.
 * One code per user; once minted, the code string is immutable.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const code = normaliseCode(parsed.data.code);
  if (!code) {
    return NextResponse.json({ error: "invalid_format" }, { status: 400 });
  }

  const existing = await prisma.affiliateCode.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "already_owns_code" }, { status: 409 });
  }

  // If the user is already a maker with a Connect account, reuse it for
  // affiliate payouts. Saves them a second onboarding trip.
  const makerProfile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { stripeAccountId: true, stripeOnboarded: true },
  });

  try {
    const created = await prisma.affiliateCode.create({
      data: {
        code,
        ownerId: session.user.id,
        stripeAccountId: makerProfile?.stripeAccountId ?? null,
        stripeOnboarded: makerProfile?.stripeOnboarded ?? false,
      },
      select: { code: true },
    });
    return NextResponse.json({ ok: true, code: created.code });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json({ error: "code_taken" }, { status: 409 });
    }
    throw err;
  }
}
