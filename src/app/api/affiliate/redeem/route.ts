import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_COOKIE,
  attachCodeOnce,
  lookupCodeForRedemption,
} from "@/lib/affiliate";

export const runtime = "nodejs";

const Body = z.object({
  code: z.string().trim().min(1).max(48),
});

/**
 * POST /api/affiliate/redeem — apply an affiliate code to the signed-in
 * user one time. Refuses if they've already redeemed; returns the
 * specific reason on validation failure so the UI can guide them.
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

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { referredByCodeId: true, affiliateBonusClaimed: true },
  });
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.referredByCodeId) {
    return NextResponse.json(
      { error: "already_redeemed" },
      { status: 409 },
    );
  }

  const lookup = await lookupCodeForRedemption(parsed.data.code, session.user.id);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.reason }, { status: 400 });
  }

  const attached = await attachCodeOnce(session.user.id, lookup.codeId);
  if (!attached) {
    // Race: someone else's request beat us to the row.
    return NextResponse.json({ error: "already_redeemed" }, { status: 409 });
  }

  // Clean up the cookie if it's still hanging around.
  const cookieStore = await cookies();
  if (cookieStore.get(AFFILIATE_COOKIE)) {
    cookieStore.delete(AFFILIATE_COOKIE);
  }

  return NextResponse.json({ ok: true });
}
