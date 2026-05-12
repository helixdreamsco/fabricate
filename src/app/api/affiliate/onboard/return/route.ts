import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOnboardingStatus } from "@/lib/payments";

/**
 * Stripe return URL after the affiliate finishes Express onboarding.
 * Mirrors /api/maker/onboard/return — translates Stripe flags to our
 * richer status and redirects with a query param the page reads.
 */
export async function GET(req: Request) {
  const base =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    new URL(req.url).origin;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/account", base));
  }

  const code = await prisma.affiliateCode.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, stripeAccountId: true, stripeOnboarded: true },
  });
  if (!code?.stripeAccountId) {
    return NextResponse.redirect(
      new URL("/account/affiliate?onboarding=missing", base),
    );
  }

  const state = await getOnboardingStatus(code.stripeAccountId);

  if (state.status === "complete" && !code.stripeOnboarded) {
    await prisma.affiliateCode.update({
      where: { id: code.id },
      data: { stripeOnboarded: true },
    });
  } else if (state.status !== "complete" && code.stripeOnboarded) {
    await prisma.affiliateCode.update({
      where: { id: code.id },
      data: { stripeOnboarded: false },
    });
  }

  return NextResponse.redirect(
    new URL(`/account/affiliate?onboarding=${state.status}`, base),
  );
}
