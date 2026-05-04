import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createConnectedAccount,
  createOnboardingLink,
  paymentMode,
} from "@/lib/payments";

/**
 * Start (or resume) Stripe Express onboarding for the signed-in maker.
 *
 * If the maker already has a `stripeAccountId`, we mint a fresh AccountLink
 * for it so they pick up where they left off. Otherwise we spin up a brand
 * new connected account first.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile)
    return NextResponse.json(
      { error: "maker profile required first" },
      { status: 400 },
    );

  // On Cloud Run req.url reflects the container's internal bind
  // (https://0.0.0.0:8080), so URLs derived from it send Stripe's redirect
  // to a dead address. Prefer the configured public origin.
  const origin =
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const returnUrl = `${origin}/api/maker/onboard/return`;
  const refreshUrl = `${origin}/maker/payouts?onboarding=refresh`;

  // Resume path: account already exists, just give them a new link.
  if (profile.stripeAccountId) {
    const link = await createOnboardingLink({
      stripeAccountId: profile.stripeAccountId,
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

  // First-time path: create the connected account too.
  const result = await createConnectedAccount({
    email: session.user.email,
    returnUrl,
    refreshUrl,
  });

  await prisma.makerProfile.update({
    where: { id: profile.id },
    data: { stripeAccountId: result.stripeAccountId },
  });

  return NextResponse.json({
    mode: result.mode,
    onboardingUrl: result.onboardingUrl,
    paymentMode: paymentMode(),
    resumed: false,
  });
}
