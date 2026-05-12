import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/affiliate/me — return the signed-in user's affiliate state
 * relevant to checkout: whether they're a referred user whose first
 * paid job will trigger the creator-side fee waiver.
 *
 * `eligible` flips false the moment they capture their first successful
 * payment (server flips `affiliateBonusClaimed` in the same transaction
 * that records the AffiliateEarning).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ eligible: false });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      referredByCodeId: true,
      affiliateBonusClaimed: true,
    },
  });
  const eligible = Boolean(
    me?.referredByCodeId && !me.affiliateBonusClaimed,
  );
  return NextResponse.json({ eligible });
}
