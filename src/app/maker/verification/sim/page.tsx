import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { paymentMode } from "@/lib/payments";
import { applyIdentityVerified } from "@/lib/maker-verification";

export const dynamic = "force-dynamic";

/**
 * Sim-mode landing page for the Stripe Identity flow. Stripe wouldn't
 * exist in dev (no `STRIPE_SECRET_KEY`), so the live "hosted URL" lands
 * here instead. We auto-mark the session as verified and bounce back to
 * /maker/verification, mirroring what the real Stripe webhook would do.
 *
 * In live mode this page is unreachable (the URL points at Stripe).
 */
export default async function StripeIdentitySimPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/maker/verification");
  if (paymentMode() === "live") redirect("/maker/verification");
  const sp = await searchParams;
  if (sp.session) {
    await applyIdentityVerified({
      stripeIdentityVerificationId: sp.session,
    });
  }
  redirect("/maker/verification?verified=1");
}
