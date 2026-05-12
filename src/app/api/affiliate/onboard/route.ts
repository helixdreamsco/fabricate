import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createConnectedAccount,
  createOnboardingLink,
  paymentMode,
} from "@/lib/payments";

export const runtime = "nodejs";

/**
 * Start (or resume) Stripe Express onboarding so the affiliate can be
 * paid out automatically when their balance crosses the threshold.
 * Reuses the maker payout account if the affiliate is also a maker
 * (handled at code mint time — this endpoint only fires when no
 * account is yet linked).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const code = await prisma.affiliateCode.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, stripeAccountId: true },
  });
  if (!code) {
    return NextResponse.json(
      { error: "mint a code first" },
      { status: 400 },
    );
  }

  const origin =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    new URL(req.url).origin;
  const returnUrl = `${origin}/api/affiliate/onboard/return`;
  const refreshUrl = `${origin}/account/affiliate?onboarding=refresh`;

  if (code.stripeAccountId) {
    const link = await createOnboardingLink({
      stripeAccountId: code.stripeAccountId,
      returnUrl,
      refreshUrl,
    });
    return NextResponse.json({
      mode: link.mode,
      onboardingUrl: link.onboardingUrl,
      paymentMode: paymentMode(),
      resumed: true,
    });
  }

  const result = await createConnectedAccount({
    email: session.user.email,
    returnUrl,
    refreshUrl,
  });

  await prisma.affiliateCode.update({
    where: { id: code.id },
    data: { stripeAccountId: result.stripeAccountId },
  });

  return NextResponse.json({
    mode: result.mode,
    onboardingUrl: result.onboardingUrl,
    paymentMode: paymentMode(),
    resumed: false,
  });
}
