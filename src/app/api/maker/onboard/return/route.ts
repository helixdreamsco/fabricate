import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOnboardingStatus } from "@/lib/payments";

/**
 * Stripe return URL after Express onboarding.
 *
 * We re-fetch the account and translate Stripe's flags into our richer
 * OnboardingStatus, then redirect to /maker/payouts with a query param the
 * page uses to render the right banner.
 *
 * Live: status comes from Stripe.
 * Sim: the return URL has `?sim_complete=1`; getOnboardingStatus treats any
 * `sim_acct_*` id as complete.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/account", req.url));
  }

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile?.stripeAccountId) {
    return NextResponse.redirect(new URL("/maker/payouts?onboarding=missing", req.url));
  }

  const state = await getOnboardingStatus(profile.stripeAccountId);

  // Only flip the DB flag once Stripe says transfers will actually work.
  if (state.status === "complete" && !profile.stripeOnboarded) {
    await prisma.makerProfile.update({
      where: { id: profile.id },
      data: { stripeOnboarded: true },
    });
  }

  return NextResponse.redirect(
    new URL(`/maker/payouts?onboarding=${state.status}`, req.url),
  );
}
