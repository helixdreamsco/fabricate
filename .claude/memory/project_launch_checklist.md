---
name: Fabricate launch checklist (essentially complete 2026-05-05)
description: All operational + code launch work is done as of 2026-05-05; tomorrow is desktop + mobile walkthroughs and then Miles considers it launched
type: project
originSessionId: a2f3133d-b865-4afc-a614-5ddf496a7795
---
**Status as of end of day 2026-05-05:** essentially launch-ready. Pre-launch banner explicitly removed by Miles. Legal review gate explicitly waived (see [pre-launch gate memory](project_prelaunch_gate.md)). All operational + code items below are done. The only remaining work is verification walkthroughs.

## Tomorrow (2026-05-06) — final walkthroughs before "considered launched"

1. **Full desktop walkthrough** — Miles plus another Google account, hitting the funnel end-to-end (sign-in → upload → configure → post → bid → accept → pay → status → pickup → review).
2. **Full mobile walkthrough** — same funnel, on a phone, both portrait and any tablet form factor he wants to check.
3. **Admin-side surfaces** (`/admin/disputes`, `/admin/verifications`) which haven't been re-walked since the data wipe.
4. After both pass, Miles considers it **launched**.

## Done as of 2026-05-05

**Infrastructure:**
- Cloud Run `fabricate-web` in europe-west1 + Cloud SQL Postgres `fabricate-prod` in europe-west2 + custom domain `fabricate.helixdreams.co` with valid cert + Firebase Hosting proxy.
- GitHub Actions deploy on every push to main; Workload Identity Federation; build-time inlining of `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` so Stripe Elements works in prod.

**Auth:**
- Google OAuth client in `genome-494016` rebranded to "Fabricate"; consent screen Published; redirect URIs include both prod and localhost.

**Payments:**
- Live Stripe keys in Secret Manager v2.
- Identity webhook `we_1TTRJK2IB7n7EoKiXi7LKDht` configured for the three identity events.
- Stripe Connect platform: business name `helixdreamsco`, statement descriptor `HELIXDREAMSCO`, branding (icon/logo + #a970ff/#5600d6), risk and loss liability = Platform liable, monetization = platform-pays-fees, Express dashboard for connected accounts.
- All required Connect capabilities active in live mode (card_payments, transfers, plus locale-specific options).
- Per-charge `statement_descriptor_suffix: "FABRICATE"` so charges are distinguishable on the shared genome+Fabricate Stripe account.
- Stripe Identity activated in live mode.
- Connect-account creation pre-fills `business_type=individual` + `mcc=7338` + product description + URL.

**Email:**
- Resend domain `helixdreams.co` verified (DKIM + SPF + DMARC all green).
- Sender wired as `Fabricate <noreply@helixdreams.co>` via Cloud Run `EMAIL_FROM` + `RESEND_FROM` env vars (set on every deploy via deploy.yml).
- Branded transactional email shell shipped (helix logo + Inter / Space Mono typography + role-based footer contact).
- Workspace aliases `support@` and `privacy@helixdreams.co` set; `abuse@` is Google-reserved (rejected as alias) so acceptable-use routes abuse reports through `support@`.

**Legal docs (all bumped to v3 / v4 with substantive 2026 UK rewrites):**
- `terms.md` v3 — personal-use-only warranty, Maker file-hygiene 24h/14d rule, expanded prohibited items (BSAIA 2025, PPE, medical, vehicle, food-contact, pressure vessels), bespoke-goods cancellation waiver with anti-chargeback wording, 14-day deemed acceptance, conspicuous boxed liability cap scaled to transaction value, GDPR data-minimisation rule for pickup addresses, NCA referral pathway.
- `privacy.md` v4 — full UK GDPR depth: data inventory, lawful-basis-per-purpose table, Stripe Identity controller split, cookies inventory, recipients with jurisdictions/roles, international-transfer mechanism per recipient, retention table per category, Article 33/34 breach commitment, account-closure mechanics.
- `acceptable-use.md` v3 — matches the depth of the other two. Detailed prohibited categories with statute citations, regulated-items-needing-certification list, marketplace integrity (no off-platform / no commercial / no review manipulation / file hygiene cross-ref), formal notice-and-takedown procedure with 5-day SLA, enforcement-ladder table, NCA + IWF referral routing.
- `PRIVACY_VERSION = 4`, `TERMS_VERSION = 3` in `src/lib/legal.ts` (mirrored in `src/proxy.ts`). Existing users were force-re-prompted via `/legal/accept` on the version bumps.
- ICO registration `ZC135824` is the real number.

**Database:**
- Wiped 2026-05-04 evening (kept only `_prisma_migrations` + `WaitlistEntry`).
- Prisma migrations applied for: `colorMatters` flag, `materialAlternatives` JSON, `materialNotes` free text.
- Stripe live Connect account `acct_1TTRkCCRE7SOaBku` deleted via API alongside the wipe.

**UX shipped during the 2026-05-05 push (lots — partial list):**
- Removed `PreLaunchBanner`.
- Removed every fake maker / fake fleet element from public surfaces (NetworkStrip, LiveFleet on landing; static MAKERS catalogue out of LoggedInHome and MakerPickerModal).
- Wired homepage + `/configure` maker picker to live `/api/makers?includeSelf=true` data, geocoded via postcodes.io for the map.
- Added "You" pill on the homepage maker list for self-recognition.
- Collapsible Material / Colour / Quality / Infill sections on `/configure` with smart defaults shown in the collapsed header.
- Material section: ranked-priority list (1-10 entries via up/down arrows) plus free-text "specific filament requirements" textarea.
- Colour section: "Colour matters" toggle (default OFF — saves makers from being forced into a specific colour) plus a custom-colour wheel for picking any hex.
- STEP file rendering via lazy-loaded `occt-import-js` (~7.6 MB WASM, only fetched when a STEP is uploaded).
- Custom legal contact addresses (privacy/terms/acceptable-use → role-based @helixdreams.co; gmail addresses removed).
- Test-mode artefacts swept from customer-facing surfaces (TestModeBadge gates, "no real charge" copy, 4242 card hint, "Stripe test" timeline events; debug `/api/debug-*` endpoints removed entirely).
- Email shell branded; bid-place / bid-accept / bid-decline / cancel / refund / pickup / dispute notifications all firing.
- Maker dashboard payout language disambiguates "released to your Stripe balance" vs. "in your bank" with explainer linking to Stripe Express.
- Cancel-job route now sweeps PENDING bids → DECLINED and notifies each maker.
- Ranked materials + materialNotes surface on creator + maker job pages (`renderMaterialPrefs` helper in `src/lib/printers.ts`).
- Loading bar on the analyse-mesh state.
- Geolocation error handling: distinguishes denied vs unavailable vs timeout, with case-specific re-enable popovers (z-1100 to clear Leaflet panes).
- Courier delivery option disabled with "Coming soon" subtitle (no real provider integrations wired).
- Calibration-print step retired entirely; Stripe Identity passes auto-approve maker verification now.
- Verification page collapsed to single step.

## Explicitly waived by Miles 2026-05-05

- UK consumer-law solicitor review of legal docs — Miles considers them reviewed.
- Insurance (Hiscox / Markel bundle) — not doing.
- Virtual office — not doing.
- Buying a non-subdomain domain — not doing.
- Waiting through the 7-day first-payout cycle on Stripe — not doing.

## Still parked but not blocking launch

- **Live end-to-end payout test** — needs a real card transaction + 7-day Stripe payout cycle to confirm the bank actually receives funds. Verifying the Transfer object exists in Stripe is sufficient for launch.
- **More real makers** — at launch the marketplace has only one maker (Miles himself). The empty-state copy on the homepage handles this gracefully ("Fabricate is brand new. Upload your file anyway — your job goes to the open market and any maker who joins can bid on it."). Outreach for more makers is a post-launch growth task.
- **Bridge Client** desktop app, **Maker mobile app + FCM** — non-goals for v1.

## Out of scope until later (unchanged)

- Automated tests (no test infra in repo).
- HMRC formal reporting (only matters above £1k trading allowance).
- D&O insurance (after first hire / investor).
- Multi-region hosting / CDN.
