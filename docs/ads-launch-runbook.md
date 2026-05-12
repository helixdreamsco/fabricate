# Fabricate · Ads Launch Runbook (£300 / 30 days)

Generated 2026-05-12. Goal: first paid traffic on-site today. Target: London,
young, art / fashion / cosplay / creator demographic. Order size 1–10 pieces,
explicitly **not** industrial customers.

Budget split:

| Channel | Spend | Daily | Why |
|---|---:|---:|---|
| Google Search | £150 | £5 | Highest commercial intent. Captures people already searching. |
| Meta (IG/FB) Reels | £100 | £3.33 | Visual demographic match. Reels surface cosplay/keycaps natively. |
| Reddit Ads | £50 | £1.67 | Niche test in r/london, r/cosplayers, r/3Dprinting. Kill in week 1 if no signal. |
| TikTok organic | £0 | n/a | Post the print process from the founder account. Skip paid TikTok at this budget. |

---

## 0 · Before you spend a penny — analytics (10 min)

You need a Plausible account so we can attribute traffic and conversions. The
code already wires events and the install snippet is hardcoded — you just need
the account + custom event goals registered.

1. Go to https://plausible.io/register and create an account.
2. Add site: `fabricate.helixdreams.co`.
3. Deploy the latest commit. The Plausible tag fires automatically in
   production builds (gated on `NODE_ENV === "production"`, no env var
   needed). Visit any page on the deployed site and confirm pageviews
   appear in Plausible within 30 seconds.
4. In Plausible → Site Settings → Goals, add custom events (these match the
   names in `src/lib/analytics.ts`):
   - `upload_started` — primary top-of-funnel signal
   - `checkout_submitted` — mid-funnel
   - `job_posted` — primary conversion (this is the equivalent of "purchase")
   - `landing_cta_clicked` — secondary
6. Confirm pageviews appear within 5 minutes of redeploy.

> Skipping analytics = setting £300 on fire. Do not run ads until pageviews
> are visible in Plausible.

---

## 1 · Google Search Ads — £150 / 30 days (£5/day)

### Create the account
1. https://ads.google.com → start a new account using your `miles.broomfield123@gmail.com` Google account.
2. **Skip Google's "smart" express flow.** Click "Switch to Expert Mode" before doing anything.
3. Add billing in GBP. Get the £400 free-credit code if Google offers it on signup (search "Google Ads £400 credit" — they push this to new accounts in the UK).

### Set up the campaign
- **Campaign type:** Search.
- **Goal:** Website traffic (skip Google's "sales" goal — that pushes you into Smart Bidding too early without enough conversion volume).
- **Networks:** Search only. **Uncheck** Display Network. **Uncheck** Search Partners.
- **Locations:** Target by location → United Kingdom → drill into → London, Greater London. Use the radius option set to ~25 miles of central London. Exclude rest of UK.
- **Language:** English.
- **Audience segments:** add observation (not targeting) — Demographics: age 18–34, all genders. Set bid adjustment +10% for 18–24, +10% for 25–34. Leave others at 0%.
- **Budget:** £5/day. Avg daily, no campaign total budget.
- **Bidding:** Maximize Clicks with a Max CPC bid limit of £1.20. (Don't use Maximize Conversions — you don't have enough conversion data yet.)
- **Ad rotation:** Optimise.
- **Ad schedule:** All day, every day.

### Ad groups & keywords

Create **three ad groups**, one per landing page.

#### Ad group A — London general
- **Final URL:** `https://fabricate.helixdreams.co/3d-printing-london`
- **Keywords (Phrase match):**
  - `"3d printing london"`
  - `"3d printing service london"`
  - `"3d printing near me"`
  - `"3d printing shop london"`
  - `"3d print service near me"`
  - `"order 3d print london"`
- **Keywords (Exact match):**
  - `[3d printing london]`
  - `[3d print london]`

#### Ad group B — Cosplay
- **Final URL:** `https://fabricate.helixdreams.co/cosplay-3d-printing`
- **Keywords (Phrase match):**
  - `"cosplay 3d printing"`
  - `"3d printed cosplay"`
  - `"3d print cosplay prop"`
  - `"cosplay armour printing"`
  - `"3d print cosplay helmet"`
  - `"3d printed prop uk"`

#### Ad group C — Keycaps
- **Final URL:** `https://fabricate.helixdreams.co/custom-keycaps`
- **Keywords (Phrase match):**
  - `"custom keycaps uk"`
  - `"3d printed keycaps"`
  - `"custom mechanical keycaps"`
  - `"artisan keycap print"`
  - `"keycap 3d print service"`

### Negative keywords (campaign-level — apply to ALL ad groups)

Paste this whole block as a negative keyword list:

```
industrial
manufacturing
production run
mass production
wholesale
bulk
bulk order
metal
metal printing
SLS
DMLS
commercial CNC
course
class
learn
tutorial
how to
buy printer
buy a printer
3d printer review
printer reviews
filament
filament uk
bambu
prusa
creality
ender
ender 3
elegoo
free
cheap
diy
secondhand
used printer
jobs
career
career advice
school
homework
software
slicer download
```

### Ad copy — paste these into each ad group

Google Search ads now use "Responsive Search Ads" — 15 headlines max, 4 descriptions max. Mix and match. Here are 15 headlines + 4 descriptions per ad group.

#### Ad group A — London general

**Headlines (15):**
1. 3D Printing in London
2. Same-Week Pickup, Local Makers
3. Upload Your File, Get a Quote
4. London's 3D Print Marketplace
5. From Cosplay to Keycaps
6. Pickup or Courier in London
7. 0% Platform Fees This Month
8. Real People, Printed Nearby
9. Instant Quote, No Sign-Up
10. London Makers Bid On Your Job
11. PLA, PETG, Resin Available
12. From 1 to 10 Pieces
13. Print On Demand · London
14. Cosplay, Keycaps, Jewellery
15. Make It Real

**Descriptions (4):**
1. Drop in an STL or STEP. A nearby London maker prints it on their machine. Pickup in a couple of days.
2. Cosplay props, custom keycaps, jewellery, minis, prototypes. Small runs of one to ten. No factory minimums.
3. Instant quote on upload — no back-and-forth. Pay on bid acceptance. Escrowed via Stripe.
4. London-based 3D-printing marketplace. Built for creators, not industrial production.

#### Ad group B — Cosplay

**Headlines:**
1. Cosplay 3D Printing London
2. Props, Armour, Weapons, Helmets
3. Print for Your Con Deadline
4. PLA · PETG · Resin SLA
5. Upload Your Cosplay STL
6. Local Maker, Fast Turnaround
7. Pieces of 1 to 10
8. From Full Sets to Single Props
9. Build Your Cosplay Faster
10. London Cosplay Print Service
11. Pickup or Courier in Days
12. Pay on Bid Acceptance
13. 0% Platform Fees · This Month
14. The Cosplay Print Marketplace
15. Make Your Costume Real

**Descriptions:**
1. Upload your prop, armour, or weapon STL. A London maker prints it. Pickup in days, not weeks.
2. PLA for big armour, resin for fine details, PETG for parts that flex. You choose, we print.
3. Mention your con date — makers bid against your deadline. Funds in escrow until pickup.
4. Built for cosplayers and prop makers. Not industrial. Not generic. Costume-first.

#### Ad group C — Keycaps

**Headlines:**
1. Custom 3D-Printed Keycaps
2. MX and Choc Compatible
3. Single Artisan or Full Set
4. Resin SLA for Clean Legends
5. FDM for Chunky Novelties
6. UK Custom Keycap Service
7. Upload Your STL
8. From One Cap to 104+
9. London Makers, Fast Turnaround
10. Mechanical Keyboard Caps
11. Pay on Bid Acceptance
12. 0% Platform Fees · This Month
13. Themed Caps, Macropad Sets
14. Print Your Keycap Idea
15. Custom Caps, Done Right

**Descriptions:**
1. Drop your keycap STL — single artisan, themed set, or full board. A London maker prints it.
2. Resin SLA for sharp legends and clean shoulders. FDM for chunky novelties. MX or Choc stems.
3. From a single artisan cap to a full 104+ set. Material colour matched on request.
4. Built for the mechanical keyboard community. Not factory. Single caps are welcome.

### Conversion tracking (after analytics is live)
- In Google Ads → Tools → Conversions → New conversion → Website.
- Set up `job_posted` as your primary conversion. Use Google Tag Manager OR
  paste the Plausible→Google conversion event proxy. (Plausible Goals → Add
  conversion API forwarding to Google Ads.)
- For week 1, also import `upload_started` as a secondary signal so you can
  see funnel drop-off in the ads dashboard.

---

## 2 · Meta (Instagram + Facebook) Ads — £100 / 30 days (£3.33/day)

Meta's algorithm needs ~50 conversions/week per ad set to fully optimise.
We won't hit that. So: bid for traffic (Link Clicks), not conversions, and
use Reels-format creative to ride free organic distribution.

### Create the account
1. https://business.facebook.com → set up a Business account.
2. Connect your IG handle `@helixdreamsco` and a Facebook page (create
   a basic Fabricate FB page if there isn't one).
3. Set up Meta Pixel for `fabricate.helixdreams.co` (Business Settings → Data Sources → Pixels).
4. Add the Pixel base script — give the pixel ID to me and I'll wire it into the layout. (Same pattern as Plausible.)
5. Set billing in GBP.

### Campaign structure

**One campaign, two ad sets, two creatives.**

- **Campaign objective:** Engagement → Link Clicks (NOT "Conversions" — too little data).
- **Special ad category:** none.
- **Budget:** £100 lifetime over 30 days (~£3.33/day).
- **A/B test:** OFF for week 1; turn on later if budget grows.

#### Ad set 1 — Cosplay-leaning
- **Audience:**
  - Location: Greater London (25-mile radius, centred on Charing Cross)
  - Age: 18–34
  - Detailed targeting (Interests, any of):
    - Cosplay
    - Comic-Con
    - LARP (live action role-playing)
    - Anime
    - Prop making
    - Fantasy & sci-fi conventions
    - MCM Comic Con
  - Detailed targeting (Behaviours): Engaged shoppers
- **Placement:** Manual → Instagram Reels, Facebook Reels, IG Stories, IG Feed.
- **Optimisation:** Link Clicks, 7-day click attribution.
- **Bid strategy:** Highest volume (no manual bid cap until you have data).
- **Landing page:** `https://fabricate.helixdreams.co/cosplay-3d-printing?utm_source=meta&utm_medium=paid&utm_campaign=cosplay_reels`

#### Ad set 2 — Design / fashion / keycaps-leaning
- **Audience:**
  - Same location & age.
  - Detailed targeting (any of):
    - Mechanical keyboards
    - Custom keyboards
    - Indie fashion
    - Design school
    - Central Saint Martins / Royal College of Art (interest targets)
    - Sculpture
    - Jewellery design
    - Independent design
- **Placement:** same as above.
- **Landing page:** `https://fabricate.helixdreams.co/?utm_source=meta&utm_medium=paid&utm_campaign=design_reels` (home, since it covers all use cases).

### Creative — what you need to make or capture

You need **2 videos**, each 9–15 seconds, vertical 9:16. Reels-native.

**Reel 1 — Cosplay print process**
- Phone shot of a maker's printer mid-print on a cosplay-style piece (helmet quarter, armour panel — anything visually identifiable as cosplay).
- Time-lapse the print or just show the layer-stripe-by-stripe.
- Overlay text on the first 3 seconds: **"Print your cosplay. London."**
- Overlay text final card: **"Upload your file. fabricate.helixdreams.co"**
- No voiceover needed. Trending audio = recommended (any sound 30s+ on Reels with >100k uses).

**Reel 2 — Keycap or design piece**
- Same format. Show a small detailed print emerging — keycap, jewellery piece, or accessory.
- First-3-seconds overlay: **"Custom keycaps. Printed in London."** (or "3D printing for creators")
- Final card: **"Make it real. fabricate.helixdreams.co"**

If you don't have a maker willing to film, fall back to:
- B-roll from existing maker profile photos (turn them into 1-second cuts in Reels' built-in editor).
- A simple static carousel of finished prints with bold caption text.

### Ad copy (Reels caption text — used in feed/Stories)

**Caption variant A (cosplay):**
```
London-based cosplayers — we print your props.

Upload your STL, get an instant quote, a nearby maker prints it. Pickup or courier in days, not weeks.

Built for cosplay. Not factories. → fabricate.helixdreams.co
```

**Caption variant B (design / keycaps):**
```
3D printing for creators in London.

Custom keycaps, jewellery, minis, prototypes — printed by people in London. Drop in your file and a local maker takes it from there.

→ fabricate.helixdreams.co
```

### Conversion tracking
- Once Meta Pixel is wired, add a Custom Event: `job_posted`.
- Send me the Pixel ID and I'll add a snippet that calls `fbq('trackCustom', 'job_posted', { value, currency: 'GBP' })` on the success branch of CheckoutForm.

---

## 3 · Reddit Ads — £50 / 30 days (£1.67/day)

Reddit's CPC in the UK is unusually low because UK advertisers don't bother
with it. For niche fit (cosplay, mech keyboards, 3D printing) this is a
goldmine. Treat as a 1-week test — if no conversions by day 7, kill it
and roll £50 into Google.

### Create the account
1. https://ads.reddit.com → sign up with `miles.broomfield123@gmail.com`.
2. Add billing in GBP.
3. Set up the Reddit Pixel for `fabricate.helixdreams.co` (Conversions → Pixel).

### Campaign structure
- **Objective:** Traffic (clicks). Don't pick Conversions; volume is too low.
- **Budget:** £50 lifetime over 28 days = £1.78/day. (Reddit's min daily is around £5; if it won't accept £1.78/day, run for 10 days at £5/day instead.)
- **Bid:** CPC, max £0.50.

### One campaign, three ad groups — one per subreddit

#### Ad group A — r/cosplay + r/london
- **Communities:** `r/cosplayers`, `r/cosplay`, `r/london`, `r/CasualUK`
- **Landing page:** `/cosplay-3d-printing?utm_source=reddit&utm_medium=paid&utm_campaign=cosplay_reddit`
- **Ad format:** Image ad (single image, 1200×628).
- **Headline:** "Print your cosplay in London — pickup in days"
- **Image:** Photo of a finished cosplay print or print-in-progress.

#### Ad group B — r/MechanicalKeyboards
- **Communities:** `r/MechanicalKeyboards`, `r/customkeycaps`, `r/keycaps`
- **Landing page:** `/custom-keycaps?utm_source=reddit&utm_medium=paid&utm_campaign=keycaps_reddit`
- **Headline:** "Custom keycaps, printed in London — single cap or full set"
- **Image:** Hero shot of a keycap or set.

#### Ad group C — r/3Dprinting (people without a printer)
- **Communities:** `r/3Dprinting`, `r/3Dprintinghelp`, `r/PrintedMinis`
- **Landing page:** `/3d-printing-london?utm_source=reddit&utm_medium=paid&utm_campaign=3dp_reddit`
- **Headline:** "Don't own a printer? London makers print for you."
- **Image:** Photo of a printer mid-print.

> **Important:** Reddit users hate corporate-style ads. Keep the copy
> conversational and benefit-led. Don't use "marketplace" or "platform" or
> "B2B" anywhere visible.

---

## 4 · TikTok — organic only (£0)

Don't spend on TikTok ads at this budget. Set up `@fabricate.london`
(or use `@helixdreamsco`) and post **3 short videos per week** for the
next 30 days:

1. **Time-lapse of a print.** Set to a trending sound. Caption: "London-printed cosplay armour." Hashtags: #3dprinting #cosplay #cosplaymaking #london
2. **Before/after of a part.** STL preview → finished printed piece. Caption: "From file to in-hand in 48 hours."
3. **Maker spotlight.** 15-second clip of a real maker showing their printer farm. Caption: "These are the people printing your cosplay in London."

Bio link → fabricate.helixdreams.co. Track with `?utm_source=tiktok&utm_medium=organic`.

TikTok algorithm rewards consistency. If you can do 3/week for 4 weeks,
something will likely catch — and if it does, the CPM-equivalent value is
better than any paid channel.

---

## 5 · Week-1 daily review (10 min/day)

Each evening, check:

1. **Plausible dashboard** — pageviews on each landing page, conversion rate
   for `job_posted`.
2. **Google Ads → Campaigns → Search Terms report** — what people actually
   searched for. Add any wasteful terms as negative keywords. Add any
   winning terms as new keywords if they're not already covered.
3. **Meta Ads → Reels delivery** — CPC, CTR. If CTR < 1% by day 3, swap the creative.
4. **Reddit Ads → CTR by subreddit** — kill any ad group with CTR < 0.3% by day 3 and roll its budget to the survivors.

### Kill criteria (week 2)
- Reddit: if `job_posted` < 1 by day 7, kill and reallocate to Google.
- Google ad groups: if CPC > £1.50 sustained for 5+ days with no conversions, lower max CPC or pause.
- Meta: if CPM > £15 with CTR < 1% by day 5, swap creative; if still bad by day 10, pause and reallocate.

### Scaling criteria (week 3 / 4)
- If `job_posted` cost-per-conversion is under £15, raise Google daily budget to £10.
- If a Reels creative has a CTR over 2.5%, duplicate the ad set with a wider audience and increase its budget.

---

## 6 · Things I cannot do that you need to do

| Task | Where | Time |
|---|---|---|
| Create Plausible account, add domain | plausible.io | 5 min |
| Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` env var + redeploy | Cloud Run | 5 min |
| Create Google Ads account, add £150 budget cap | ads.google.com | 10 min |
| Create Meta Business Suite + Pixel ID, send me the Pixel ID | business.facebook.com | 10 min |
| Create Reddit Ads account, add £50 budget cap | ads.reddit.com | 5 min |
| Take 2 phone videos (cosplay print + keycap/design print) — 9:16 vertical, 9-15 sec | Phone | 30 min if you have access to a maker right now |
| Take 1 hero image per landing page for Reddit ads | Phone or existing maker photos | 15 min |
| Approve final ad copy before activating each campaign | This doc | 5 min |

**Order of operations recommended:**
1. Plausible (everything depends on it).
2. Google Ads (highest expected ROI, can launch with copy alone — no photo needed).
3. Reddit Ads (cheap test, can launch with one hero image per ad group).
4. Meta Ads (needs the most creative work; do last, while waiting on photo/video).

---

## 7 · Reality on "traffic by end of today"

- **Google Search Ads** start serving impressions within ~1 hour of campaign approval (sometimes faster). You will see clicks today. Expect 8–20 clicks on £5/day in week 1.
- **Reddit Ads** start showing within an hour. Expect 5–15 clicks/day from £1.78/day.
- **Meta Ads** need ~12–24 hours of "learning" before they spend efficiently. You may see 1–3 clicks in the first 12 hours, then ramp.
- **Organic Google traffic** for the new landing pages: 3–14 days to index, 30–90 days to rank meaningfully. Don't expect organic until June.

If everything goes live tonight, realistic week-1 traffic is **150–300 unique visitors** to the landing pages. The conversion rate target on `job_posted` is 1.5–3% — so **3 to 9 paying jobs in week 1**. That's the bar to beat.
