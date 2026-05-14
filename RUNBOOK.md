# fabricate — Runbook

A Next.js 16 marketplace app. Full operational docs are split across:

- **[`DEPLOYMENT.md`](DEPLOYMENT.md)** — production deploy walkthrough (Vercel / Cloud Run / Fly.io), env-var table, post-deploy verification.
- **[`GCP_SETUP.md`](GCP_SETUP.md)** — Google Cloud Postgres + Cloud Run + Storage setup.
- **[`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md)** — pre-launch gate items.
- **[`FUTURE_FEATURES.md`](FUTURE_FEATURES.md)** — roadmap.
- **[`docs/ads-launch-runbook.md`](docs/ads-launch-runbook.md)** — paid acquisition.

This file is the **Mac-Mini-quickstart**.

Repo: `git@github.com:helixdreamsco/fabricate.git`. Firebase target also in play (`fabricate-helixdreams` hosting on `helixdreamsco-cd2a2`).

## Mac Mini bring-up

```bash
# 1. clone
gh repo clone helixdreamsco/fabricate && cd fabricate

# 2. runtimes
brew install node@22       # package.json: "engines.node": ">=20.9.0", Dockerfile uses node:22
brew install postgresql@16 && brew services start postgresql@16

# 3. install deps (postinstall runs prisma generate + copies occt-import-js wasm)
npm install

# 4. local db
createdb fabricate_dev

# 5. env — .env.local for local dev (the dev server reads it, not .env)
cp .env.example .env.local
$EDITOR .env.local
# Minimum to boot:
#   AUTH_SECRET    = openssl rand -base64 32
#   AUTH_TRUST_HOST=true
#   DATABASE_URL   = postgresql://localhost:5432/fabricate_dev?schema=public
#   AUTH_GOOGLE_ID / _SECRET  (from GCP OAuth client — dev redirect URI:
#                              http://localhost:3000/api/auth/callback/google)
# Optional but recommended:
#   STRIPE_SECRET_KEY (sk_test_…), NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_…),
#   STRIPE_IDENTITY_WEBHOOK_SECRET (from `stripe listen`)
#   RESEND_API_KEY (otherwise emails silently no-op)

# 6. migrations
npx prisma migrate deploy   # or `migrate dev` for the interactive flow

# 7. dev server
npm run dev
# → http://localhost:3000
```

## Secrets cheat-sheet (full detail in DEPLOYMENT.md + .env.example)

| Var | Where to get it / regenerate |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` — rotating logs everyone out |
| `AUTH_GOOGLE_ID` / `_SECRET` | GCP Console → Credentials. Separate dev/prod clients. Dev redirect URI: `http://localhost:3000/api/auth/callback/google` |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `dashboard.stripe.com/{test,}/apikeys` — test mode for dev |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | `stripe listen` output (test) or webhook config (live) |
| `RESEND_API_KEY` | `resend.com` → API Keys. Without it, email is a no-op |
| `DATA_DIR` | Host-dependent. Vercel = ephemeral (uploads break); Cloud Run = mount GCS bucket; Fly = persistent volume |
| `STAGING_ACCESS_CODE` | Self-chosen — gates the whole site behind a cookie for the pre-launch banner |
| `AFFILIATE_PAYOUT_SECRET`, `REDDIT_MONITOR_SECRET` | Self-chosen bearer secrets; cron endpoints 503 without them |

Pre-launch banner gate: `STAGING_ACCESS_CODE` cookie required. See `project_prelaunch_gate.md` in `.claude/memory/`.

## Deploy

See **[`DEPLOYMENT.md`](DEPLOYMENT.md)** for Vercel / Cloud Run / Fly paths. TL;DR for Cloud Run (current target):

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/genome-494016/cloud-run-source-deploy/fabricate
gcloud run deploy fabricate --image=us-central1-docker.pkg.dev/genome-494016/cloud-run-source-deploy/fabricate --region=us-central1
```

Cron jobs (affiliate payouts, Reddit monitor digest) — see `.claude/memory/reference_cloud_scheduler_jobs.md`.

## Dev workflow

**No automated promotion to prod.** See `.claude/memory/feedback_no_automated_promotion.md` — production deploys are deliberate, never auto.

GH issue → feat branch → PR to `test` → self-review → merge → test deploy → prod promotion only on user sign-off. Same convention as co-lab/genome-web.

## Stack quick-ref

- **Framework:** Next.js 16 (App Router). See `AGENTS.md` — this is a breaking-change Next, read `node_modules/next/dist/docs/` not training data.
- **DB:** Prisma + Postgres.
- **Auth:** NextAuth (Google + email/password).
- **Payments:** Stripe Connect + Stripe Identity.
- **3D:** `@react-three/fiber` + `@jscad/modeling` + `occt-import-js` (STL/STEP in-browser).
- **Email:** Resend.
