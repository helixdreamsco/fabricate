import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startIdentitySession } from "@/lib/stripe-identity";
import { recordIdentitySessionStart } from "@/lib/maker-verification";

export const runtime = "nodejs";

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile)
    return NextResponse.json({ error: "no maker profile" }, { status: 400 });

  const id = await startIdentitySession({
    makerId: profile.id,
    returnUrl: `${APP_BASE}/maker/verification`,
  });
  await recordIdentitySessionStart({
    makerId: profile.id,
    stripeIdentityVerificationId: id.id,
  });

  return NextResponse.json({
    sessionId: id.id,
    url: id.url,
    clientSecret: id.clientSecret,
    status: id.status,
    mode: id.mode,
  });
}
