---
name: Fabricate Stripe Connect setup decisions
description: Architectural decisions Miles made on 2026-04-29 when configuring Stripe Connect for HELIXDREAMSCO LTD; reuse these when picking up the Stripe onboarding checklist
type: project
originSessionId: 7cccfd4b-df44-4ef2-a72b-9fcdc3bd623c
---
Decisions Miles locked in for HELIXDREAMSCO LTD's Stripe Connect setup. Use these when assembling the onboarding checklist and when filling in the Stripe dashboard sections.

## Architectural decisions (already wired in code)

- **Account type: Express.** Stripe-hosted maker onboarding; Express dashboard at `dashboard.stripe.com/express` for makers; platform handles marketplace logic. Already implemented in `src/lib/payments.ts` and `src/app/api/maker/onboard/route.ts`.
- **Onboarding flow: hosted by Stripe.** `accountLinks.create({ type: 'account_onboarding' })` redirects maker to `connect.stripe.com/setup/...` with our branding, then returns to `/maker/payouts`. Not embedded components — chosen 2026-04-29 to minimise integration code.
- **Charge model: destination charges.** Customer pays Fabricate (merchant of record); Fabricate forwards maker's share via `transfer_data.destination` on the PaymentIntent. Already implemented in the bid-accept flow.
- **Statement descriptor:** to be set at `FABRICATE` or `HELIXDREAMSCO` (22 chars max). Decide at dashboard config time.
- **Branding:** helix logo (`src/app/icon.svg`), brand colour `#7c3aed`.

## Risk & loss liability — "platform is responsible"

Miles chose **platform-liable** in Stripe's risk/loss-liability section on 2026-04-29.

Implications:
- Fabricate is the merchant of record on card statements.
- Chargebacks file against Fabricate's Stripe balance (deducted immediately + £15 dispute fee).
- Refunds come out of Fabricate's balance; recovery from maker via `transfers.createReversal` if maker has balance, otherwise Fabricate eats the gap.
- Fabricate handles all chargeback defence + evidence submission.

This was the **deliberate** choice over the alternatives (Standard accounts where maker is merchant, or `on_behalf_of` hybrid) because both alternatives break Fabricate's escrow model and push customer service onto makers who aren't equipped for it.

## Mitigations agreed

- **3DS / SCA already on** via Stripe Payment Element — fraud chargebacks shift liability to the card issuer (bank) under UK PSD2. Free, automatic.
- **Stripe Chargeback Protection: skipped at launch.** 0.4%-of-transaction add-on covering fraud-only chargebacks. Revisit at ~£10k/mo revenue when the per-transaction cost makes sense.
- **Evidence trail relied upon for service-quality disputes:** pickup QR token, mutual reviews, dispute messages, optional completion photos, optional test-strip stencil. All already built and in production state.
- **Operating reserve to keep:** ~£500–1000 in HELIXDREAMSCO's bank account to cover unwinnable chargebacks before they hit Miles personally as a sole director.
- **Insurance considered:** Cyber + Tech PI + Public Liability bundle from Hiscox. Tracked separately on the launch checklist.

## Stripe Connect onboarding checklist (do once, in this order)

1. **Confirm Connect + Identity enabled** at https://dashboard.stripe.com → More → Connect (Express type) and More → Identity. Both must be activated.
2. **Risk and loss liability section** in Connect dashboard → choose **platform liable** (what Miles selected on 2026-04-29).
3. **Statement descriptor** → `FABRICATE` or `HELIXDREAMSCO`, 22-char limit.
4. **Branding** → upload helix logo (use `src/app/icon.svg` directly or render as PNG), brand colour `#7c3aed`.
5. **Stripe CLI webhook for Identity:**
   ```bash
   brew install stripe/stripe-cli/stripe
   stripe login
   stripe listen --forward-to localhost:3000/api/webhooks/stripe-identity \
     --events identity.verification_session.verified,identity.verification_session.requires_input,identity.verification_session.canceled
   ```
   Capture the `whsec_…` value and set as `STRIPE_IDENTITY_WEBHOOK_SECRET` in `.env.local`.
6. **Walk through verification flow** at `/maker/verification` with Miles's real passport in test mode (resolves in seconds without touching real ID systems).
7. **Live mode keys** — defer until production deployment. When ready: dashboard top-right toggle to Live, grab `sk_live_…` and `pk_live_…` from `https://dashboard.stripe.com/apikeys`, set as production env vars on the hosting platform.
8. **Live webhook endpoint** — re-create the Identity webhook in live mode pointing at `https://<production-domain>/api/webhooks/stripe-identity`, copy the new `whsec_…` to production env vars.

## Follow-ups parked (revisit later)

- Chargeback Protection at ~£10k/mo revenue.
- Liability shift to maker (`on_behalf_of` / Standard accounts) — only if marketplace dynamics change and we want makers to handle their own customer service.
- Stripe Tax for VAT calculation if HMRC threshold (£90k/yr) is approached.
