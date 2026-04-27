/**
 * Payments adapter — abstracts Stripe Connect so the same code path runs in:
 *
 *   - "live" mode: real Stripe API calls (requires STRIPE_SECRET_KEY +
 *     onboarded Express accounts). Production path.
 *   - "sim"  mode: in-process deterministic simulator. No network. Used for
 *     local dev and the manual two-account test flow before Stripe creds are
 *     provisioned. UI surfaces a "TEST MODE" pill anywhere a payment shows.
 *
 * Lifecycle (separate charges + transfers — standard marketplace escrow):
 *
 *   1. authorizeAndCapture() — creator accepts a bid. Charge captured to the
 *      platform balance immediately. Funds held there until pickup.
 *   2. transferToMaker()     — pickup verified. A Transfer moves funds from
 *      the platform balance to the maker's connected account, minus the
 *      platform fee (which stays).
 *   3. refund()              — cancellation pre-pickup. Full refund to creator,
 *      no transfer ever happens.
 *
 * Maker onboarding:
 *
 *   - createConnectedAccount() returns an onboarding URL (live) or a
 *     synthetic completion URL (sim).
 *   - completeOnboarding() flips MakerProfile.stripeOnboarded = true.
 */

import Stripe from "stripe";

export type PaymentMode = "live" | "sim";

export function paymentMode(): PaymentMode {
  return process.env.STRIPE_SECRET_KEY ? "live" : "sim";
}

export function isLive(): boolean {
  return paymentMode() === "live";
}

let _stripe: Stripe | null = null;
function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing — adapter is in sim mode");
  // apiVersion intentionally omitted to use the SDK's pinned default — the
  // installed SDK type for it is moving target across versions.
  _stripe = new Stripe(key);
  return _stripe;
}

// ── deterministic sim id generator ─────────────────────────────────────────
// Counter persists per-process; collisions across restarts don't matter
// because the IDs are also stored in DB rows so a re-mint always produces a
// fresh ID.
const counters = new Map<string, number>();
function simId(prefix: string): string {
  const n = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, n);
  return `sim_${prefix}_${Date.now().toString(36)}${n.toString(36).padStart(3, "0")}`;
}

// ── connected account onboarding ───────────────────────────────────────────

export type ConnectedAccountResult = {
  mode: PaymentMode;
  stripeAccountId: string;
  /** URL to send the maker to in order to complete onboarding. In sim mode
   *  this is a local route that auto-completes; in live mode it's a Stripe
   *  AccountLink. */
  onboardingUrl: string;
};

export async function createConnectedAccount(opts: {
  email: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<ConnectedAccountResult> {
  if (isLive()) {
    const acct = await stripe().accounts.create({
      type: "express",
      email: opts.email,
      country: "GB",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    const link = await stripe().accountLinks.create({
      account: acct.id,
      type: "account_onboarding",
      return_url: opts.returnUrl,
      refresh_url: opts.refreshUrl,
    });
    return { mode: "live", stripeAccountId: acct.id, onboardingUrl: link.url };
  }
  const id = simId("acct");
  return {
    mode: "sim",
    stripeAccountId: id,
    onboardingUrl: `${opts.returnUrl}${opts.returnUrl.includes("?") ? "&" : "?"}sim_complete=1`,
  };
}

/**
 * Mint a fresh AccountLink for an existing connected account so the maker
 * can resume onboarding (or update details) without us spinning up a brand
 * new Stripe account on every retry. Account links are single-use and
 * short-lived (~5 minutes) so this is safe to call freely.
 */
export async function createOnboardingLink(opts: {
  stripeAccountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<{ mode: PaymentMode; onboardingUrl: string }> {
  if (isLive()) {
    const link = await stripe().accountLinks.create({
      account: opts.stripeAccountId,
      type: "account_onboarding",
      return_url: opts.returnUrl,
      refresh_url: opts.refreshUrl,
    });
    return { mode: "live", onboardingUrl: link.url };
  }
  return {
    mode: "sim",
    onboardingUrl: `${opts.returnUrl}${opts.returnUrl.includes("?") ? "&" : "?"}sim_complete=1`,
  };
}

/** Onboarding state for a Stripe Express account.
 *
 *   not_started     — `details_submitted` false. Maker hasn't filled the form.
 *   pending         — `details_submitted` true, no `currently_due` items, but
 *                     `charges_enabled` / `payouts_enabled` still false.
 *                     Stripe is reviewing — usually seconds in test mode.
 *   action_required — `currently_due` has fields the maker still needs to
 *                     supply (often after Stripe asks for verification docs).
 *   restricted      — `disabled_reason` is set; the account is blocked until
 *                     the maker resolves it.
 *   complete        — all three Stripe flags true. Transfers will succeed.
 */
export type OnboardingStatus =
  | "not_started"
  | "pending"
  | "action_required"
  | "restricted"
  | "complete";

export type OnboardingState = {
  status: OnboardingStatus;
  /** Human-readable detail (e.g. "ID document required"). May be null. */
  detail: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export async function getOnboardingStatus(stripeAccountId: string): Promise<OnboardingState> {
  if (!isLive()) {
    // Sim accounts are treated as fully complete on first read; the DB flag
    // is what actually drives the UI in sim mode.
    return {
      status: stripeAccountId.startsWith("sim_acct_") ? "complete" : "not_started",
      detail: null,
      chargesEnabled: true,
      payoutsEnabled: true,
    };
  }
  const acct = await stripe().accounts.retrieve(stripeAccountId);
  const chargesEnabled = !!acct.charges_enabled;
  const payoutsEnabled = !!acct.payouts_enabled;
  const detailsSubmitted = !!acct.details_submitted;
  const disabledReason = acct.requirements?.disabled_reason ?? null;
  const currentlyDue = acct.requirements?.currently_due ?? [];
  const pendingVerification = acct.requirements?.pending_verification ?? [];

  // 1. Fully ready.
  if (chargesEnabled && payoutsEnabled && detailsSubmitted) {
    return { status: "complete", detail: null, chargesEnabled, payoutsEnabled };
  }

  // 2. The form was never submitted. Stripe still flags everything as
  //    `past_due` for fresh accounts, so we look at `details_submitted`
  //    rather than `disabled_reason` to detect this case. The CTA is
  //    "resume onboarding".
  if (!detailsSubmitted) {
    return { status: "not_started", detail: null, chargesEnabled, payoutsEnabled };
  }

  // 3. Hard restrictions — only the "rejected.*" + a few platform reasons
  //    actually mean "you can't proceed". Other disabled reasons usually
  //    coincide with currently_due items and are better surfaced as
  //    action_required.
  const HARD_BLOCKS = new Set([
    "rejected.fraud",
    "rejected.terms_of_service",
    "rejected.listed",
    "rejected.platform_fraud",
    "rejected.platform_other",
    "rejected.other",
    "listed",
    "platform_paused",
  ]);
  if (disabledReason && HARD_BLOCKS.has(disabledReason)) {
    return {
      status: "restricted",
      detail: humanizeRequirement(disabledReason),
      chargesEnabled,
      payoutsEnabled,
    };
  }

  // 4. Stripe wants more info. Common after submit when the maker missed
  //    a field or Stripe asks for ID verification.
  if (currentlyDue.length > 0) {
    return {
      status: "action_required",
      detail: currentlyDue.slice(0, 3).map(humanizeRequirement).join(", "),
      chargesEnabled,
      payoutsEnabled,
    };
  }

  // 5. Submitted, no outstanding fields, but Stripe still verifying.
  return {
    status: "pending",
    detail: pendingVerification.length > 0
      ? `Verifying: ${pendingVerification.slice(0, 2).map(humanizeRequirement).join(", ")}`
      : "Stripe is reviewing your details — usually seconds, occasionally a few minutes.",
    chargesEnabled,
    payoutsEnabled,
  };
}

/** Compatibility shim for any caller that just wants the binary "ready" flag. */
export async function isAccountOnboarded(stripeAccountId: string): Promise<boolean> {
  const s = await getOnboardingStatus(stripeAccountId);
  return s.status === "complete";
}

/** Stripe's requirement keys are dot-cased identifiers like
 *  `individual.verification.document` — turn into something readable. */
function humanizeRequirement(s: string): string {
  return s
    .replace(/^individual\./, "")
    .replace(/^business_profile\./, "business ")
    .replace(/_/g, " ")
    .replace(/\./g, " · ");
}

// ── payments (creator → platform) ──────────────────────────────────────────

export type IntentResult = {
  mode: PaymentMode;
  paymentIntentId: string;
  /** Client secret used by Stripe Elements on the client to confirm the
   *  payment. In sim mode this is a sentinel and the client should not
   *  attempt to load Stripe Elements. */
  clientSecret: string;
};

/**
 * Create a PaymentIntent ready to be confirmed by the client via Stripe
 * Elements. Live: a real Stripe PaymentIntent with automatic_payment_methods
 * enabled. Sim: a deterministic stub.
 *
 * Capture happens automatically on confirmation (capture_method = automatic).
 * Funds land in the platform balance; the maker payout is a separate
 * Transfer fired at pickup verification.
 */
export async function createPaymentIntent(opts: {
  amountPence: number;
  payerEmail: string;
  description: string;
  metadata?: Record<string, string>;
}): Promise<IntentResult> {
  if (isLive()) {
    const intent = await stripe().paymentIntents.create({
      amount: opts.amountPence,
      currency: "gbp",
      capture_method: "automatic",
      description: opts.description,
      receipt_email: opts.payerEmail,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: opts.metadata,
    });
    return {
      mode: "live",
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret ?? "",
    };
  }
  const pi = simId("pi");
  return { mode: "sim", paymentIntentId: pi, clientSecret: `${pi}_secret_sim` };
}

export type CapturedIntent = {
  mode: PaymentMode;
  paymentIntentId: string;
  chargeId: string;
  amountPence: number;
};

/**
 * Verify a PaymentIntent has been confirmed + captured by the client. Used
 * by the accept-bid route once Stripe Elements has done its dance. Throws
 * if the intent is in any state other than `succeeded`.
 *
 * In sim mode we don't have a real intent to look up — the caller skips
 * this verification and uses the synthetic ids directly.
 */
export async function verifyCapturedIntent(opts: {
  paymentIntentId: string;
  expectedAmountPence: number;
}): Promise<CapturedIntent> {
  if (!isLive()) {
    throw new Error("verifyCapturedIntent should not be called in sim mode");
  }
  const intent = await stripe().paymentIntents.retrieve(opts.paymentIntentId);
  if (intent.status !== "succeeded") {
    throw new Error(`PaymentIntent ${intent.id} is ${intent.status}, not succeeded`);
  }
  if (intent.amount !== opts.expectedAmountPence) {
    throw new Error(
      `PaymentIntent amount mismatch: expected ${opts.expectedAmountPence}, got ${intent.amount}`,
    );
  }
  const chargeId = typeof intent.latest_charge === "string"
    ? intent.latest_charge
    : intent.latest_charge?.id ?? "";
  return {
    mode: "live",
    paymentIntentId: intent.id,
    chargeId,
    amountPence: intent.amount,
  };
}

/** Sim-mode "capture" for accept flow. Generates the synthetic ids that
 *  would have come back from Stripe in live mode. Kept separate from the
 *  live path so the live path can't accidentally fall into sim defaults. */
export function simCaptured(): CapturedIntent {
  return {
    mode: "sim",
    paymentIntentId: simId("pi"),
    chargeId: simId("ch"),
    amountPence: 0, // caller fills with bid amount
  };
}

export async function refund(opts: {
  paymentIntentId: string;
  reason?: string;
}): Promise<{ mode: PaymentMode; refundId: string }> {
  if (isLive()) {
    const r = await stripe().refunds.create({
      payment_intent: opts.paymentIntentId,
      reason: opts.reason as Stripe.RefundCreateParams.Reason | undefined,
    });
    return { mode: "live", refundId: r.id };
  }
  return { mode: "sim", refundId: simId("re") };
}

// ── transfers (platform → maker) ───────────────────────────────────────────

export type TransferResult = {
  mode: PaymentMode;
  transferId: string;
};

export async function transferToMaker(opts: {
  amountPence: number;
  destinationAccountId: string;
  /** Source charge id — links transfer back to original payment for Stripe
   *  reconciliation. */
  sourceChargeId?: string;
  description: string;
}): Promise<TransferResult> {
  if (isLive()) {
    const t = await stripe().transfers.create({
      amount: opts.amountPence,
      currency: "gbp",
      destination: opts.destinationAccountId,
      source_transaction: opts.sourceChargeId,
      description: opts.description,
    });
    return { mode: "live", transferId: t.id };
  }
  return { mode: "sim", transferId: simId("tr") };
}
