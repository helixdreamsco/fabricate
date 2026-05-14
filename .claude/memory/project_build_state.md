---
name: Fabricate build state (snapshot)
description: Snapshot of what's built, what's stubbed, and what's deferred — useful for picking up where we left off without re-tracing the whole codebase
type: project
originSessionId: d2050eb6-7695-4ddf-9bf5-c8a4435e6126
---
**Fabricate is now a real bid-and-pickup marketplace** (rebuilt from the
demo flow on 2026-04-27). Two-account testing flow works end-to-end in dev.
Customer-facing release still gated by [Fabricate pre-launch gate](project_prelaunch_gate.md).

**Production flow surfaces:**

- **Creator post** — homepage upload → `/configure` → `/checkout` (now a "post job" form, not a Stripe checkout: pickup postcode, optional notes, optional prioritized maker pick) → POSTs file to `/api/uploads`, then `/api/jobs` → redirect to `/jobs/[id]`.
- **Open market** — `/market` lists all OPEN jobs to any logged-in maker. Prioritized-for-me jobs sort first with a star badge. Cards link to `/jobs/[id]` for bidding.
- **Bidding** — at `/jobs/[id]` a logged-in maker (no Stripe onboarding required to bid; required to be selected) sees the `MakerBidPanel` and POSTs price/ETA/message to `/api/jobs/[id]/bids`. Bids upsert by `(jobId, makerId)`.
- **Accept** — creator's `/jobs/[id]` shows `CreatorBidPanel` while OPEN; clicking Accept calls `/api/jobs/[id]/bids/[bidId]/accept` which captures payment, marks the bid ACCEPTED, declines the rest, sets `assignedMakerId`, transitions job → ASSIGNED.
- **Maker dashboard** — `/maker` (rewritten) shows active jobs, pending bids, payouts. KPIs only. `/maker/profile` for setup, `/maker/payouts` for Stripe Connect onboarding + payout history.
- **Maker job mgmt** — `/maker/jobs/[id]` is the maker's view of an active job: spec, file download, MakerControls (Start printing → Mark ready → pickup verify panel), add-to-timeline log/issue, chat (right column).
- **Pickup** — `/maker/jobs/[id]` mints a pickup token automatically when status flips to READY_FOR_PICKUP. Creator's `/jobs/[id]` shows a server-rendered `PickupCodeDisplay` with QR (inline SVG via `qrcode` lib) + 6-digit code. Maker scans/types via `PickupCodeEntry` (BarcodeDetector with manual fallback). Reverse direction available via `/api/jobs/[id]/pickup/mint` with `direction: CREATOR_TO_MAKER` for cameraless makers.
- **Status push** — `/api/jobs/[id]/status` validates against the state machine in `src/lib/jobs.ts`.
- **Chat** — `JobChat` component talks to `/api/jobs/[id]/messages` and subscribes to `/api/jobs/[id]/stream` for SSE updates.
- **Timeline** — append-only `JobEvent` rows; `JobTimeline` renders.
- **Payments** — `src/lib/payments.ts` adapter. `STRIPE_SECRET_KEY` toggle: live mode does real Stripe Connect (Express, destination charges + application fee, separate transfers); sim mode generates `sim_pi_*` / `sim_tr_*` ids deterministically. UI surfaces `TestModeBadge` everywhere a sim payment shows. `Payment` row created at bid acceptance (status CAPTURED). `Payout` row created at pickup verification (Transfer to maker's connected account, minus platform fee).
- **Cancel/refund** — `/api/jobs/[id]/cancel` from OPEN/ASSIGNED/IN_PROGRESS; refunds captured payment if any.
- **Communities** — unchanged from prior build. `Job.communityId` (loose ref) carries forward.
- **Multi pickup locations (added 2026-05-09)** — `MakerProfile` now has a `pickupLocations: PickupLocation[]` relation (model in `prisma/schema.prisma`, migration `20260509120000_pickup_locations`). Cap = 5. The legacy `MakerProfile.postcode/lat/lng` still exists as a *mirror of the primary location row* (kept so single-postcode reads in jobs/bids/JSON-LD don't have to change). `MakerProfileSummary.locations[]` is filled by `/api/makers` (geocodes every postcode in one batch). `FleetMap` accepts an optional `Maker.pinId` so multi-location makers render as multiple pins sharing the same `id` (clicking any pin still selects the maker). The list view on `/` and `/configure` MakerPickerModal still shows one row per maker.

**Key files (production flow):**

- `prisma/schema.prisma` — `MakerProfile`, `Job`, `JobBid`, `JobEvent`, `JobMessage`, `PickupToken`, `Payment`, `Payout`. Money fields are pence (Int) to avoid float drift.
- `src/lib/payments.ts` — Stripe adapter + sim simulator
- `src/lib/jobs.ts` — state machine + `recordJobEvent` + SSE bus
- `src/lib/pickup.ts` — token mint + consume (single-use, 2h TTL)
- `src/lib/money.ts` — pence helpers + 8% platform fee (£0.50 floor)
- `src/lib/maker-profile.ts` — get-or-create
- `src/components/jobs/*` — StatusPill, TestModeBadge, JobTimeline, JobChat, PickupCodeDisplay, PickupCodeEntry
- `src/app/api/jobs/**`, `src/app/api/maker/**`, `src/app/api/uploads/**`
- `src/app/jobs/[id]/{page,CreatorBidPanel,CreatorActions,MakerBidPanel}.tsx`
- `src/app/maker/jobs/[id]/{page,MakerControls}.tsx`

**Stack notes:**

- **Prisma 6.19** kept. Schema pushed via `prisma db push` (no migration history yet — first migration baseline will land at the Postgres switch).
- **SSE bus** still `EventEmitter` keyed by `community:<id>` and now `job:<id>` too. Single-process — Redis/LISTEN before scale-out.
- **Files** stored on disk under `prisma/uploads/`. Served via `/api/uploads/[name]` with auth check (creator + assigned maker + any registered maker if job is OPEN). **Swap to S3/R2 before any deploy with ephemeral filesystem.**
- **QR** generated server-side as inline SVG (`qrcode` lib).
- **Camera scan** uses `BarcodeDetector` API; manual entry is universal fallback.
- **Retired**: `/order/[id]` now redirects to `/jobs`. The original ad-hoc `OrderProvider` client-side draft state is still used to pass file/config from `/configure` to `/checkout` but no longer drives a fake order ID.

**What's stubbed / deferred (still):**

- Bridge Client desktop app
- Maker mobile app + FCM
- Real courier API integrations
- Per-part filament selection in multi-material
- Live Stripe Payment Element on the client (the `/api/jobs/[id]/bids/[bidId]/accept` route handles it server-side, but the React side currently passes no `paymentMethodId` — required when `STRIPE_SECRET_KEY` is set. Add Stripe Elements before flipping live).
- Postgres migration baseline (currently SQLite + `db push`)

**Hard non-goals (still — do not build without explicit ask):**

- Bridge Client / hardware integration
- Maker mobile app
- Per-part filament mixing

**(Reversed from prior memory):**

- ~~Real Stripe Connect / escrow~~ — now in scope and partly built. Adapter at `src/lib/payments.ts`. Live path requires `STRIPE_SECRET_KEY` + Stripe Payment Element on client. Sim path is functional today.

**Dev environment state (don't expect this to still be true on resume):**

- Next.js dev typically on `:3000`
- FastAPI dev on `:8000`
- SQLite at `prisma/dev.db`
- Uploads at `prisma/uploads/`

**How to apply:** This is the "what's already done" reference. Before offering to build something here, check it isn't already on the list. Pickup, bidding, payments-with-test-mode, chat, timeline, and the mobile-first job UI are all live. Mobile `TopNav` doesn't yet have a hamburger — links to `/jobs` and `/market` are hidden under `md:` breakpoint, so on phones users must type the URL or use the dashboard cards.
