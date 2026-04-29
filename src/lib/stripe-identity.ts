/**
 * Stripe Identity adapter — mirrors the live/sim split in `payments.ts`.
 *
 * In live mode (STRIPE_SECRET_KEY set), creates real VerificationSessions
 * and verifies webhooks against STRIPE_IDENTITY_WEBHOOK_SECRET. In sim mode
 * (key absent), returns a fake "verified" session immediately so dev flows
 * work without Stripe.
 */

import Stripe from "stripe";
import { paymentMode } from "./payments";

export type IdentitySession = {
  id: string;
  status: "requires_input" | "processing" | "verified" | "canceled";
  // Hosted URL the maker visits to complete the flow. In sim mode this is a
  // local route that posts back the simulated webhook.
  url: string;
  // For embedded Stripe.js usage; sim returns a placeholder.
  clientSecret: string;
  mode: "live" | "sim";
};

let _stripe: Stripe | null = null;
function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing — adapter is in sim mode");
  _stripe = new Stripe(key);
  return _stripe;
}

const counters = new Map<string, number>();
function simId(prefix: string): string {
  const n = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, n);
  return `sim_${prefix}_${Date.now().toString(36)}${n.toString(36).padStart(3, "0")}`;
}

/**
 * Begin a new ID + selfie verification session for a maker. In sim mode,
 * the returned `url` lands on `/maker/verification/sim?session=<id>` which
 * marks the session verified and bounces the user back. In live mode, it's
 * a Stripe-hosted URL.
 */
export async function startIdentitySession(opts: {
  makerId: string;
  returnUrl: string;
}): Promise<IdentitySession> {
  if (paymentMode() === "live") {
    const session = await stripe().identity.verificationSessions.create({
      type: "document",
      metadata: { makerId: opts.makerId },
      return_url: opts.returnUrl,
      options: {
        document: {
          allowed_types: ["driving_license", "passport", "id_card"],
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },
    });
    return {
      id: session.id,
      status: (session.status as IdentitySession["status"]) ?? "requires_input",
      url: session.url ?? "",
      clientSecret: session.client_secret ?? "",
      mode: "live",
    };
  }

  const id = simId("vs");
  return {
    id,
    status: "requires_input",
    url: `/maker/verification/sim?session=${encodeURIComponent(id)}`,
    clientSecret: id,
    mode: "sim",
  };
}

/**
 * In live mode, validate a Stripe webhook payload's signature and return
 * the parsed event. In sim mode, callers don't use this (sim posts go
 * directly to the in-process completion route).
 */
export function verifyWebhook(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_IDENTITY_WEBHOOK_SECRET missing");
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}

/** Pull a session from Stripe to read its current verified status. */
export async function fetchIdentitySession(
  id: string,
): Promise<{ status: IdentitySession["status"]; verifiedAt: Date | null }> {
  if (paymentMode() === "live") {
    const session = await stripe().identity.verificationSessions.retrieve(id);
    return {
      status: (session.status as IdentitySession["status"]) ?? "requires_input",
      verifiedAt:
        session.status === "verified" ? new Date() : null,
    };
  }
  // Sim mode: every retrieval after the user clicks the sim button is verified.
  return { status: "verified", verifiedAt: new Date() };
}
