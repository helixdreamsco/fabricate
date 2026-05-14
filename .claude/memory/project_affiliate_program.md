---
name: project-affiliate-program
description: "Affiliate program — schema, decisions, payout cron — for when adding features that touch fees, signup, or capture"
metadata: 
  node_type: memory
  type: project
  originSessionId: 24e865aa-84a0-4ad8-bc10-c303dfd9eff4
---

Affiliate program shipped 2026-05-12. Schema, lib, dashboard, capture-time accrual, Stripe Connect payouts all live.

**Why:** Replaced the launch promo (which gave away 100% of fees to everyone) with a referral-incentivised version. Same Fabricate cost per referred user, but the kickback flows to the affiliate as a reward instead of nobody.

**How to apply:** Before touching pricing, signup, capture flow, or payouts:

- Codes are uppercase `[A-Z0-9_-]{4,32}`, e.g. `NOFEES-MILES`. Normalised via `normaliseCode()` in [[lib/affiliate]].
- **One affiliate code per user, ever.** Immutable after first redemption. Enforced by `attachCodeOnce()` (race-safe `updateMany where: referredByCodeId: null`).
- Trigger: referred user's **first successful payment capture** (not first job posted). Free-mode jobs do NOT count — the slot is preserved.
- Plan A collision rule: if both creator+maker are referred & unclaimed on the same job, creator's checkout-time waiver wins, maker loses theirs, both affiliates get 50p consolation from Fabricate's pocket.
- Maker-referred case redirects the **creator's service-fee snapshot** (£2+10%) to the affiliate, not the 8% maker cut. Different from the symmetric reading — Miles confirmed "vice versa" meant this.
- Payouts: £20 threshold, Stripe Connect Express, daily sweep via Cloud Scheduler `affiliate-payout-sweep` at 03:00 Europe/London. Maker affiliates reuse their existing `MakerProfile.stripeAccountId`.
- Endpoint: `POST /api/affiliate/payouts/sweep` with `Authorization: Bearer $AFFILIATE_PAYOUT_SECRET`. Returns 503 if env unset.

**Free-mode fee fix also shipped same commit:** community jobs with subtotal=0 now skip BOTH fees (`pricing.ts` service fee + `money.ts` platform cut). No £2 floor / 50p floor when no money changes hands.

**Launch promo disabled 2026-05-12:** `NEXT_PUBLIC_PROMO_NO_FEE=false` in deploy.yml. Fees reactivated site-wide.

Related: [[project-reddit-monitor]], [[reference-cloud-scheduler-jobs]].
