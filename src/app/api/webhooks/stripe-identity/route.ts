import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/stripe-identity";
import {
  applyIdentityVerified,
  applyIdentityFailed,
} from "@/lib/maker-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live-mode Stripe Identity webhook. Configure in the Stripe dashboard with
 * endpoint URL https://YOUR_HOST/api/webhooks/stripe-identity and the events
 *   identity.verification_session.verified
 *   identity.verification_session.requires_input
 *   identity.verification_session.canceled
 *
 * Set STRIPE_IDENTITY_WEBHOOK_SECRET to the matching whsec_… signing secret.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const raw = await req.text();
  let event;
  try {
    event = verifyWebhook(raw, sig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  type StripeIdentityEvent = {
    type: string;
    data: { object: { id?: string } };
  };
  const e = event as unknown as StripeIdentityEvent;
  const sessionId = e.data?.object?.id;
  if (!sessionId)
    return NextResponse.json({ ok: true, skipped: true });

  switch (e.type) {
    case "identity.verification_session.verified":
      await applyIdentityVerified({
        stripeIdentityVerificationId: sessionId,
      });
      break;
    case "identity.verification_session.requires_input":
      await applyIdentityFailed({
        stripeIdentityVerificationId: sessionId,
        newStatus: "requires_input",
      });
      break;
    case "identity.verification_session.canceled":
      await applyIdentityFailed({
        stripeIdentityVerificationId: sessionId,
        newStatus: "canceled",
      });
      break;
  }
  return NextResponse.json({ ok: true });
}
