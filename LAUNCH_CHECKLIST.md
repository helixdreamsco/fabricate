# Pre-launch features — full specs + test plans

Seven gaps to close before customer-facing launch. Each section is a self-contained spec: problem, acceptance criteria, schema/API/UI changes, and a concrete test plan with executable commands. You can verify any feature individually without touching the others.

**Status legend:** 🟡 READY FOR MANUAL TEST · 🟡 IN PROGRESS · 🟢 DONE

**Conventions in test commands**
- `JOB_ID` — placeholder for an existing job id; substitute one from `sqlite3 prisma/dev.db "select id from Job limit 1;"`.
- `CREATOR_COOKIE` / `MAKER_COOKIE` — replace with the value of `next-auth.session-token` from the browser dev tools after signing in as that user. Pass with `-b "next-auth.session-token=<value>"`.
- `BASE` — `http://localhost:3000`.
- All test commands assume the dev server is running and DB is at `prisma/dev.db`.

---

## 1. Dispute flow 🔴

### Problem
The job state machine has a `DISPUTED` status defined but no UI surface to file, respond, or resolve a dispute. The test-strip free-on-failure feature has no flow that activates it because there's no dispute event to attach to.

### Acceptance criteria
- Creator can file a dispute on a job in `IN_PROGRESS`, `READY_FOR_PICKUP`, or `PICKED_UP`.
- One open dispute per job at a time (DB-enforced).
- Maker can post messages + evidence on the open dispute.
- Admin (a designated owner email — start with `miles.broomfield123@gmail.com`) can resolve the dispute, transitioning the job to `COMPLETED` (maker wins) or `CANCELLED` (creator wins).
- Resolution writes a `JobEvent` (`kind=dispute_resolved`) and triggers refund logic if creator wins (handled in §2).
- Filing a dispute auto-marks the test strip as eligible for free request (already wired via §2026-04-28 `testStripRequestedByCreatorAt`).

### Schema changes
```prisma
model Dispute {
  id        String   @id @default(cuid())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  filedById String
  filedBy   User     @relation("DisputeFiledBy", fields: [filedById], references: [id], onDelete: Cascade)
  reason    String   // free-text, max 1000
  // OPEN | RESOLVED_CREATOR | RESOLVED_MAKER
  status    String   @default("OPEN")
  resolvedAt        DateTime?
  resolvedByAdminId String?
  resolutionNote    String?
  createdAt DateTime @default(now())

  messages DisputeMessage[]

  @@unique([jobId, status]) // SQLite caveat: unique allows multiple NULLs, so on RESOLVED_* the same job can have a second OPEN later
  @@index([status, createdAt])
}

model DisputeMessage {
  id         String   @id @default(cuid())
  disputeId  String
  dispute    Dispute  @relation(fields: [disputeId], references: [id], onDelete: Cascade)
  authorId   String
  author     User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  body       String
  evidenceUrl String? // path under /uploads/ for image evidence
  createdAt  DateTime @default(now())

  @@index([disputeId, createdAt])
}
```
Add to `User`: `disputesFiled Dispute[] @relation("DisputeFiledBy")`, `disputeMessages DisputeMessage[]`.

### API endpoints
- `POST /api/jobs/[id]/disputes` — body `{ reason: string, evidenceUrl?: string }`. Auth: creator only. Validates job status is one of `IN_PROGRESS|READY_FOR_PICKUP|PICKED_UP`. Creates Dispute (OPEN), transitions Job to `DISPUTED`, writes `JobEvent` with `kind=issue_reported`.
- `POST /api/jobs/[id]/disputes/[disputeId]/messages` — body `{ body: string, evidenceUrl?: string }`. Auth: creator OR assigned maker. Appends `DisputeMessage`.
- `POST /api/jobs/[id]/disputes/[disputeId]/resolve` — body `{ outcome: "creator" | "maker", note?: string }`. Auth: admin only. Sets status, transitions Job. If `outcome=creator`, triggers refund (§2).
- `GET /api/jobs/[id]/disputes` — returns the active dispute + messages. Auth: parties + admin.

### UI changes
- New `DisputeCard` server component on both job detail pages. States: "Report an issue" button (no open dispute, allowed status), "Open dispute" panel (active), "Resolved" summary (closed).
- New `DisputeForm` client component with reason textarea + image upload.
- New `/admin/disputes/page.tsx` — admin queue showing all OPEN disputes, with resolve actions.

### Test plan
- [ ] **Schema applied:**
  ```bash
  sqlite3 prisma/dev.db ".schema Dispute" | grep -c "filedById"   # should print 1
  ```
- [ ] **File a dispute (creator):** sign in as creator on a job in `IN_PROGRESS`, click "Report an issue", submit reason "test print blew off bed". Job badge flips to "Disputed".
  ```bash
  curl -X POST $BASE/api/jobs/JOB_ID/disputes \
    -b "next-auth.session-token=CREATOR_COOKIE" \
    -H "content-type: application/json" \
    -d '{"reason":"test print blew off bed"}'
  # expect: { dispute: { id, status: "OPEN", ... } }
  sqlite3 prisma/dev.db "select status from Job where id='JOB_ID';"   # expect: DISPUTED
  ```
- [ ] **Maker responds:** sign in as assigned maker, see dispute, post reply.
  ```bash
  curl -X POST $BASE/api/jobs/JOB_ID/disputes/DISPUTE_ID/messages \
    -b "next-auth.session-token=MAKER_COOKIE" \
    -H "content-type: application/json" \
    -d '{"body":"happy to reprint"}'
  ```
- [ ] **Second open dispute rejected:** retry the file POST as creator → 409.
- [ ] **Admin resolves in creator's favour:** browser to `/admin/disputes`, click resolve → choose "creator wins". Job → `CANCELLED`, refund record auto-created (§2).
  ```bash
  sqlite3 prisma/dev.db "select status from Job where id='JOB_ID';"   # expect: CANCELLED
  sqlite3 prisma/dev.db "select count(*) from Refund where paymentId=(select id from Payment where jobId='JOB_ID');"   # expect: 1
  ```
- [ ] **Admin resolves in maker's favour:** on a different dispute, resolve "maker wins". Job → `COMPLETED`, no refund row created.
- [ ] **Non-admin cannot resolve:** 403 from creator/maker on POST resolve.

---

## 2. Refund + escrow plumbing 🔴

### Problem
Stripe is in sim mode (per `lib/payments.ts`). When real payments go live, refund movement is not wired. Even today, the records and state plumbing must exist so dispute resolution can drive it.

### Acceptance criteria
- `Refund` model linked to `Payment`.
- `issueRefund(paymentId, amountPence, reason)` server helper. In sim mode writes a fake `stripeRefundId` ("sim_re_xxx") and marks status `succeeded`. In live mode calls `stripe.refunds.create`.
- Refunds are partial-aware (multiple refunds per payment, capped at total payment amount).
- Refund triggers payout adjustment: maker payout = payment - sum(refunds).
- Refund event appears on `JobTimeline` for both parties.

### Schema changes
```prisma
model Refund {
  id        String   @id @default(cuid())
  paymentId String
  payment   Payment  @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  amountPence Int
  reason    String?
  // pending | succeeded | failed
  status    String   @default("pending")
  mode      String   @default("sim")
  stripeRefundId String? @unique
  failureReason  String?
  issuedByAdminId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([paymentId])
}
```
Add to `Payment`: `refunds Refund[]`.

### API endpoints
- `POST /api/admin/refunds` — body `{ paymentId, amountPence, reason }`. Auth: admin. Calls `issueRefund`. Writes `JobEvent` with `kind=payment_refunded`.

### UI changes
- Refund summary block on job detail (creator + maker view) when any `Refund` exists for that payment.
- Admin refund button on `/admin/disputes/[id]` resolution screen.

### Test plan
- [ ] **Schema applied:**
  ```bash
  sqlite3 prisma/dev.db ".schema Refund" | grep -c "stripeRefundId"   # 1
  ```
- [ ] **Issue full refund (sim):** seed a Payment, hit endpoint:
  ```bash
  PAYMENT_ID=$(sqlite3 prisma/dev.db "select id from Payment limit 1;")
  AMOUNT=$(sqlite3 prisma/dev.db "select amountPence from Payment where id='$PAYMENT_ID';")
  curl -X POST $BASE/api/admin/refunds \
    -b "next-auth.session-token=ADMIN_COOKIE" \
    -H "content-type: application/json" \
    -d "{\"paymentId\":\"$PAYMENT_ID\",\"amountPence\":$AMOUNT,\"reason\":\"creator dispute won\"}"
  sqlite3 prisma/dev.db "select status, amountPence, mode from Refund where paymentId='$PAYMENT_ID';"
  # expect: succeeded | $AMOUNT | sim
  ```
- [ ] **Issue partial refund:** £5 of a £10 payment. Verify second refund row, sum of refunds = £5.
- [ ] **Cap enforcement:** attempt a refund exceeding payment total → 400 with "exceeds payment".
- [ ] **Payout adjusted:** payout amount = payment - sum(refunds).
- [ ] **Timeline event:** JobTimeline shows "Refund issued · £X · creator dispute won".
- [ ] **Live-mode call (when Stripe is enabled):** Stripe dashboard shows the refund with matching `stripeRefundId`.

---

## 3. Maker verification 🔴

### Problem
Anyone with a Stripe Connect account becomes a maker. No identity check, no proof of capability. Direct fraud risk.

### Acceptance criteria
- New `MakerVerification` linked 1:1 with `MakerProfile`.
- Three submission steps: identity photo upload, address proof upload, calibration print photo (we provide a 20mm calibration STL via `/api/test-print/CAL-20MM` reusing the existing engraver — actually a fresh helper to print "CAL-20MM" stencil at 20mm).
- Status: `not_started` → `pending_review` → `approved` | `rejected`.
- Bid placement gated on `verifiedAt != null`.
- Admin queue at `/admin/verifications` to approve/reject.
- Verified badge in bid lists, on public maker profile (§5), and in maker picker.

### Schema changes
```prisma
model MakerVerification {
  id          String  @id @default(cuid())
  makerId     String  @unique
  maker       MakerProfile @relation(fields: [makerId], references: [id], onDelete: Cascade)
  // not_started | pending_review | approved | rejected
  status      String  @default("not_started")
  identityUrl     String?
  addressProofUrl String?
  calibrationPrintUrl String?
  submittedAt     DateTime?
  reviewedAt      DateTime?
  reviewedByAdminId String?
  rejectionReason String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```
Add `verification MakerVerification?` to `MakerProfile`. Convenience: `verifiedAt` is `verification.reviewedAt` when status=approved, else null.

### API endpoints
- `POST /api/maker/verification/submit` — multipart with identity, addressProof, calibrationPrint files. Auth: maker. Sets status to `pending_review`.
- `POST /api/admin/verifications/[id]/approve` — auth: admin. Status→approved, reviewedAt=now.
- `POST /api/admin/verifications/[id]/reject` — body `{ reason }`. auth: admin. Status→rejected.
- `POST /api/jobs/[id]/bids` — existing route, **add guard**: rejects with 403 if maker not verified.

### UI changes
- New `/maker/verification/page.tsx` with the 3-step form.
- "Pending verification" gate banner on `/maker` dashboard until approved.
- Verified ✓ badge component (`<VerifiedBadge />`) injected next to maker names anywhere they show.
- New `/admin/verifications/page.tsx` queue.

### Test plan
- [ ] **Bid blocked pre-verification:**
  ```bash
  curl -X POST $BASE/api/jobs/JOB_ID/bids \
    -b "next-auth.session-token=NEW_MAKER_COOKIE" \
    -H "content-type: application/json" \
    -d '{"priceOfferPence":1500,"etaHours":24}'
  # expect: 403 with "verification required"
  ```
- [ ] **Submit verification:** maker uploads three files via `/maker/verification`. Verify:
  ```bash
  sqlite3 prisma/dev.db "select status, identityUrl is not null, addressProofUrl is not null, calibrationPrintUrl is not null from MakerVerification where makerId='MAKER_ID';"
  # expect: pending_review|1|1|1
  ```
- [ ] **Approve as admin:** browser to `/admin/verifications`, click approve. Verify:
  ```bash
  sqlite3 prisma/dev.db "select status, reviewedAt is not null from MakerVerification where makerId='MAKER_ID';"
  # expect: approved|1
  ```
- [ ] **Bid succeeds post-verification:** repeat the bid POST → 200 with `{ bid: {...} }`.
- [ ] **Reject reflows:** reject a different submission with reason → maker sees the reason on `/maker/verification` and a "Resubmit" button.
- [ ] **Verified badge visible:** verified maker's bid shows ✓ badge in `CreatorBidPanel`.

---

## 4. Notification system 🔴

### Problem
Only one event sends an email (prioritized maker on creation). No in-app feed, no badges. Users have to refresh the site to see state changes.

### Acceptance criteria
- Generic `Notification` model.
- Email delivery via Resend on every category (Resend already in `package.json`).
- In-app notification feed: bell icon in `TopNav` with unread badge, dropdown shows last 50.
- Triggers: `bid_placed`, `bid_accepted`, `message_received`, `status_ready_for_pickup`, `pickup_minted`, `dispute_filed`, `dispute_resolved`, `refund_issued`, `review_submitted`, `review_revealed`, `maker_verified`.
- Per-user category opt-out at `/account/notifications`.
- Email throttling for `message_received` (max 1 email per 30 min per recipient).

### Schema changes
```prisma
model Notification {
  id         String   @id @default(cuid())
  recipientId String
  recipient  User     @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  // categories above
  kind       String
  body       String
  link       String?
  // serialized JSON for rich rendering
  data       String?
  readAt     DateTime?
  createdAt  DateTime @default(now())

  @@index([recipientId, readAt, createdAt])
}

model NotificationPreference {
  id         String  @id @default(cuid())
  userId     String  @unique
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  // JSON map: kind → { email: bool, inApp: bool }
  prefs      String  @default("{}")
  updatedAt  DateTime @updatedAt
}
```
Add to `User`: `notifications Notification[] @relation("NotificationRecipient")`, `notificationPrefs NotificationPreference?`.

### API endpoints
- `GET /api/notifications?cursor=&limit=` — paginated feed, oldest cursor.
- `POST /api/notifications/mark-read` — body `{ ids: string[] }`. Mark notifications as read.
- `POST /api/notifications/mark-all-read` — clears unread.
- `GET /api/notifications/preferences` / `PUT /api/notifications/preferences` — body is the JSON prefs map.

### UI changes
- `<NotificationBell />` client component in `TopNav`. Polls every 30s OR uses SSE (existing `@/lib/events` bus already handles real-time on the chat side; reuse).
- `<NotificationDropdown />` with last 50, group by day.
- `/account/notifications/page.tsx` for prefs.

### Internal helper
- `src/lib/notify.ts`:
  ```ts
  export async function notify(opts: {
    recipientId: string; kind: NotifKind; body: string; link?: string; data?: unknown;
  }): Promise<void>;
  ```
  Writes a Notification row + sends email (respecting prefs + throttling for messages) + emits SSE event for live update.

### Test plan
- [ ] **Bid placed → creator notified:**
  ```bash
  # As maker, place a bid:
  curl -X POST $BASE/api/jobs/JOB_ID/bids -b "next-auth.session-token=MAKER_COOKIE" \
    -H "content-type: application/json" -d '{"priceOfferPence":1500,"etaHours":24}'
  # Verify creator has new notification:
  sqlite3 prisma/dev.db \
    "select count(*) from Notification where recipientId=(select creatorId from Job where id='JOB_ID') and kind='bid_placed' and readAt is null;"
  # expect: >=1
  ```
- [ ] **Bell badge updates:** sign in as creator, see bell with "1" badge → click → see "New bid on <fileName>". Click → marks read; badge clears on refresh.
- [ ] **Email sent:** check Resend dashboard for an email to the creator's address with the bid notification subject.
- [ ] **Message throttling:** send 5 messages from maker → only first email goes out within 30 min; in-app notifications all logged.
- [ ] **Opt-out works:** turn off `message_received` email pref → send another message → no email sent (check resend); in-app still arrives.
- [ ] **Mark all read:**
  ```bash
  curl -X POST $BASE/api/notifications/mark-all-read -b "next-auth.session-token=COOKIE"
  sqlite3 prisma/dev.db "select count(*) from Notification where recipientId='UID' and readAt is null;"   # 0
  ```

---

## 5. Public maker profile page 🔴

### Problem
`/makers/[id]` doesn't exist. Reviews and rating badges have nowhere to lead. New makers can't share a portfolio link.

### Acceptance criteria
- Server-rendered `/makers/[id]/page.tsx` (where `[id]` is the `MakerProfile.id`).
- Public data only: display name, bio, city (postcode → outward code only, e.g. "N16"), printer model, AMS, materials, communities (only if not member-only and only if visible).
- Verified badge if applicable (§3).
- Aggregate rating + count, full review list (paginated, 20 per page).
- Linked from every maker mention site-wide.
- "Owner-only" controls: if signed-in user is the maker, show "Edit profile" link.
- SEO: `<title>` and meta description with display name + city.

### Schema changes
None.

### API endpoints
- Reuses `GET /api/makers/[id]/reviews` (already exists).
- Optional: `GET /api/makers/[id]/profile` — public profile JSON for client-side use; server page reads directly via prisma.

### UI changes
- New `/makers/[id]/page.tsx` server component.
- Inject `<Link href={`/makers/${maker.id}`}>` around every maker name in:
  - `CreatorBidPanel` (bid rows)
  - `CommunityView` makers sidebar
  - Job detail "Collect from <maker>" line
  - Prioritized-maker pill on creator's job page
- New `<PublicProfileHeader />` shared layout component.

### Test plan
- [ ] **Page loads anonymously:**
  ```bash
  curl -sS -o /dev/null -w "%{http_code}\n" $BASE/makers/MAKER_ID
  # expect: 200
  ```
- [ ] **No private data leaked:** view source — full postcode (e.g. "N16 6DD") absent; only outward code ("N16") present.
- [ ] **Rating badge + reviews list:** seed two completed reviews via direct SQL or use the existing one. Page shows aggregate ★ and review cards.
- [ ] **Pagination:** seed 25 reviews → page 1 shows 20, "Load more" reveals next 5.
- [ ] **Self-link:** signed in as the maker, page shows "Edit profile" → goes to `/maker/profile`.
- [ ] **Linked from bid list:** click maker name in `CreatorBidPanel` → lands on the profile.
- [ ] **Verified badge visible** when applicable (§3 must be done first; check that the badge component renders).
- [ ] **SEO:** view-source contains `<title>Miles @helixdreamsco · N16 · Fabricate</title>` (or similar).

---

## 6. Upload validation + safety 🔴

### Problem
The upload route accepts any file. A 500MB malformed STL crashes the slicer; a `.exe` renamed to `.stl` is undetected; non-manifold meshes waste maker time.

### Acceptance criteria
- File size cap: 50 MB (configurable constant).
- Allowed extensions: `.stl`, `.3mf`, `.step`, `.stp`, `.obj`.
- Magic-byte sniff: header verification matches extension.
- STL validation: parse, reject if non-manifold OR zero-volume OR dimensions exceed largest registered build volume (warn-only on dimensions, reject otherwise).
- All checks happen server-side in `src/app/api/uploads/route.ts`.
- Friendly error messages back to the configure UI.

### Schema changes
None.

### Implementation notes
- `src/lib/upload-validation.ts` — small helpers: `assertSize`, `assertExtension`, `assertMagicBytes`, `assertManifold` (uses three.js / three-stdlib's `STLLoader` for parsing, then `BufferGeometryUtils.mergeVertices` + edge count check).
- Magic-byte expectations:
  - STL ASCII: file starts with literal `solid `
  - STL binary: 80-byte header followed by 4-byte triangle count; can't easily distinguish from junk, so allow if extension is `.stl` and the byte length matches `80 + 4 + count*50`.
  - `.3mf`: ZIP header `PK\x03\x04`.
  - `.step` / `.stp`: starts with `ISO-10303-21`.
  - `.obj`: starts with `# ` or vertex spec lines.
- Set Next body parser limit in `next.config.ts` (`api.bodyParser.sizeLimit = '50mb'` — but App Router uses Web Request; size cap is enforced by reading content-length header and bailing on stream).

### Test plan
- [ ] **Size cap:**
  ```bash
  dd if=/dev/zero of=/tmp/big.stl bs=1m count=100 2>/dev/null
  curl -X POST $BASE/api/uploads -F "file=@/tmp/big.stl" -b "next-auth.session-token=COOKIE"
  # expect: 413 or 400 with "File too large (max 50 MB)"
  ```
- [ ] **Extension whitelist:**
  ```bash
  echo hi > /tmp/test.zip
  curl -X POST $BASE/api/uploads -F "file=@/tmp/test.zip" -b "..."
  # expect: 400 "Unsupported file type"
  ```
- [ ] **Magic-byte mismatch:**
  ```bash
  echo "MZ this is not stl" > /tmp/sneaky.stl   # PE header
  curl -X POST $BASE/api/uploads -F "file=@/tmp/sneaky.stl" -b "..."
  # expect: 400 "File contents don't match extension"
  ```
- [ ] **Non-manifold STL:**
  - Use a known broken STL (e.g. an open-mesh test from `node_modules/three/examples/.../bad.stl` if available, or generate one).
  - expect: 400 "Mesh is not watertight"
- [ ] **Oversized but valid:** generate a 1m × 1m × 1m STL → upload → 200 with warning in response: `{ analysis: { warnings: ["Won't fit any registered printer (max build volume: 360 × 360 × 360 mm)"] } }`.
- [ ] **Happy path unchanged:** existing `Basic.3mf` upload still succeeds, returns analysis.

---

## 7. Tax handling 🔴

### Problem
UK VAT (20%) on the platform service fee should be calculated and stored. No record of maker income for HMRC self-assessment.

### Acceptance criteria
- VAT calculated on the `serviceFee` portion of every quote (currently £2 + 10% per `src/lib/pricing.ts`). Display "inc. VAT" on quote.
- `TaxRecord` per Payment with breakdown.
- Maker dashboard widget: "Earned this tax year (06 Apr–05 Apr): £X · trading allowance £1,000 used / £1,000 left".
- CSV export of maker tax records: date, jobId, gross, platform fee (ex VAT), VAT on platform fee, payout (gross to maker).

### Schema changes
```prisma
model TaxRecord {
  id            String   @id @default(cuid())
  paymentId     String   @unique
  payment       Payment  @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  // Snapshot of pre-VAT amounts at capture time
  grossPence            Int  // what the customer paid
  platformFeeNetPence   Int  // platform's pre-VAT cut
  platformFeeVatPence   Int  // VAT on platform cut (20% UK)
  makerPayoutPence      Int  // gross to maker
  vatRate               Float @default(0.20)
  capturedAt            DateTime @default(now())

  @@index([capturedAt])
}
```
Add `taxRecord TaxRecord?` to `Payment`.

### API endpoints
- `GET /api/maker/tax-records?from=&to=` — auth: maker. Returns rows for the requesting maker's jobs.
- `GET /api/maker/tax-records.csv?taxYear=2026-2027` — auth: maker. Streams CSV download.

### Helper
- `src/lib/tax.ts`:
  ```ts
  export const VAT_RATE_UK = 0.20;
  export function platformFeeBreakdown(serviceFeeIncVatPence: number): {
    netPence: number; vatPence: number;
  };
  export function ukTaxYearBounds(year: number): { start: Date; end: Date }; // 6 Apr Y → 5 Apr (Y+1)
  ```

### UI changes
- Quote breakdown on `/configure` and `/checkout`: split fee into "Service fee £X · VAT £Y · Total £Z (inc.)".
- New "Earnings & tax" card on `/maker` dashboard with current tax-year totals + CSV download link.

### Test plan
- [ ] **Quote shows VAT:** browser to `/configure` with a uploaded STL → service fee row shows "£3.60 inc. VAT" with hover/aside revealing the £0.60 component (£3 ex + £0.60 VAT = £3.60 inc).
- [ ] **TaxRecord written on payment capture:**
  ```bash
  # Trigger payment capture flow (sim mode):
  # … existing test fixture for accepting a bid …
  PAYMENT_ID=$(sqlite3 prisma/dev.db "select id from Payment order by createdAt desc limit 1;")
  sqlite3 prisma/dev.db \
    "select grossPence, platformFeeNetPence, platformFeeVatPence, makerPayoutPence from TaxRecord where paymentId='$PAYMENT_ID';"
  # expect non-null row; vat = round(platformFeeNetPence * 0.20)
  ```
- [ ] **Math reconciles:** `grossPence == platformFeeNetPence + platformFeeVatPence + makerPayoutPence`.
- [ ] **Maker dashboard shows totals:**
  - Sign in as maker who has 2+ completed jobs → dashboard shows "Earned this tax year: £X". X equals sum of `makerPayoutPence` for completed jobs in the current 6 Apr → 5 Apr window.
- [ ] **CSV export:**
  ```bash
  curl -sS $BASE/api/maker/tax-records.csv?taxYear=2026-2027 -b "next-auth.session-token=MAKER_COOKIE" \
    -o /tmp/tax.csv
  head -2 /tmp/tax.csv
  # expect: header row + at least 1 data row matching db
  ```
- [ ] **Privacy:** maker A cannot fetch maker B's tax CSV → 403.

---

## Order of implementation

Working priority (highest impact first):

1. Dispute flow (#1)
2. Refund records (#2 — paired with #1)
3. Maker verification (#3)
4. Public maker profile page (#5 — unblocks the trust loop from reviews)
5. Notification system (#4)
6. Upload validation (#6)
7. Tax handling (#7)

Tax is last because it only matters at scale. Everything else is foundational.

---

## Cross-cutting test setup

Helpers to make any of the test plans above easier to run.

```bash
# Get a job id for testing
JOB_ID=$(sqlite3 prisma/dev.db "select id from Job limit 1;")

# Get a session cookie (after logging in via UI):
# 1. Sign in at $BASE/account
# 2. Open dev tools → Application → Cookies → copy value of `next-auth.session-token`
# 3. Save as env var:
export CREATOR_COOKIE="..."
export MAKER_COOKIE="..."
export ADMIN_COOKIE="..."
```

```bash
# Reset dev DB (destructive — back up first if needed):
rm prisma/dev.db
npx prisma db push
# Then re-seed via the UI.
```

```bash
# Tail dev errors during testing:
tail -f .next/dev/logs/next-development.log | grep -i error
```
