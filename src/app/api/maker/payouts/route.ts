import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) {
    return NextResponse.json({
      profile: null,
      payouts: [],
      totals: { paidPence: 0, pendingPence: 0 },
    });
  }
  const payouts = await prisma.payout.findMany({
    where: { makerId: profile.id },
    orderBy: { createdAt: "desc" },
    include: {
      payment: {
        include: {
          job: { select: { id: true, fileName: true } },
        },
      },
    },
  });
  const paidPence = payouts
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + p.amountPence, 0);
  const pendingPence = payouts
    .filter((p) => p.status === "PENDING")
    .reduce((s, p) => s + p.amountPence, 0);
  return NextResponse.json({
    profile,
    payouts,
    totals: { paidPence, pendingPence },
  });
}
