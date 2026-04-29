# Deploying Fabricate

This is the runbook for taking Fabricate from local dev to a production deployment. Walks through three common host paths (Vercel, Cloud Run, Fly.io), covers env vars, database, file storage, and the post-deploy verification sequence.

> **Pre-launch banner:** while `PreLaunchBanner` is mounted in `src/app/layout.tsx`, the production site is gated to a private audience by the `STAGING_ACCESS_CODE` env var (see `src/proxy.ts`). Don't remove the banner without sign-off from the legal/T&S review (see `~/.claude/projects/-Users-milesbroomfield-Desktop-fabricate/memory/project_prelaunch_gate.md`).

---

## Pre-deploy checklist

Run through this **before** triggering the first deploy. Items in order of severity.

- [ ] **Database is Postgres**, not SQLite. Local dev runs against `fabricate_dev` on Homebrew Postgres; production needs a hosted Postgres. Provision Neon / Cloud SQL / Vercel Postgres, get the connection string.
- [ ] **`prisma migrate deploy` works** against the prod DB. Apply existing migrations:
  ```bash
  DATABASE_URL="<prod-conn-string>" npx prisma migrate deploy
  ```
  Confirm zero errors.
- [ ] **Stripe Connect + Identity** activated in `dashboard.stripe.com` (live mode toggle on for real launch). Settings mirror dev: Express + destination charges + platform-liable + hosted onboarding.
- [ ] **Live Stripe webhook endpoint** created in dashboard pointing at `https://YOUR-DOMAIN/api/webhooks/stripe-identity`. Subscribe to `identity.verification_session.{verified,requires_input,canceled}`. Save the new `whsec_…` signing secret.
- [ ] **Google OAuth credentials** for production: separate client in Google Cloud Console with redirect URI `https://YOUR-DOMAIN/api/auth/callback/google`. Don't reuse dev credentials.
- [ ] **Resend domain verified.** Sender of transactional email moves from `onboarding@resend.dev` (sandbox) to a verified domain like `noreply@helixdreams.co`. Verify the domain at resend.com → Domains.
- [ ] **All env vars from `.env.example`** ready to paste into the host's secrets store.

---

## Env vars (paste from `.env.example`, set on host)

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | yes | `https://your-domain` (no trailing slash) |
| `APP_URL` | yes | same value as above |
| `AUTH_TRUST_HOST` | yes | `true` |
| `AUTH_SECRET` | yes | 32+ random bytes; `openssl rand -base64 32` |
| `DATABASE_URL` | yes | `postgresql://…` from prod Postgres provider |
| `AUTH_GOOGLE_ID` | yes | from Google Cloud Console (prod credentials) |
| `AUTH_GOOGLE_SECRET` | yes | ditto |
| `STRIPE_SECRET_KEY` | yes | `sk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | yes | `pk_live_…` |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | yes | `whsec_…` from prod webhook config |
| `RESEND_API_KEY` | recommended | otherwise emails silently no-op |
| `RESEND_FROM` / `EMAIL_FROM` | recommended | `Fabricate <hello@your-domain>` |
| `DATA_DIR` | host-dependent | see Storage section below |
| `STAGING_ACCESS_CODE` | optional | gates the whole site behind a code; remove for public launch |
| `API_HOST` | only if running the FastAPI slicer | `https://api.your-domain` |

---

## Path A — Vercel (easiest for Next.js)

**Catch:** Vercel's serverless functions have an **ephemeral filesystem**. `/api/uploads` writes mesh files and images to `prisma/uploads/`, which works locally but vanishes on every deploy. Two options:

1. **Skip Vercel for now.** Pick Cloud Run or Fly.io which support persistent volumes.
2. **Build an S3 driver.** Replace the disk-write logic in `src/app/api/uploads/route.ts` and `/image/route.ts` with Vercel Blob or R2. Roughly 200 lines of code; not built yet. Ask Claude to do this when you commit to Vercel.

If you want to push ahead with Vercel anyway and accept that uploads break:

1. `npm install -g vercel`
2. `vercel login`
3. `vercel link` (project root)
4. `vercel env add` for each var in the table above (or paste from the dashboard).
5. Push to main → Vercel deploys automatically.
6. Add custom domain at Vercel dashboard → Settings → Domains.
7. Set Google OAuth redirect URIs + Stripe webhook to the new domain.

---

## Path B — Cloud Run + Cloud SQL Postgres + Cloud Storage

Closest match to the codebase's intent (`prisma/schema.prisma` mentions `Cloud SQL inside genome-494016`). Persistent storage works via mounted Cloud Storage bucket.

### One-time setup

```bash
gcloud config set project genome-494016

# Provision Postgres
gcloud sql instances create fabricate-prod \
  --database-version=POSTGRES_16 \
  --region=europe-west2 \
  --tier=db-f1-micro \
  --storage-type=SSD --storage-size=20GB
gcloud sql databases create fabricate --instance=fabricate-prod
gcloud sql users create fabricate --instance=fabricate-prod --password=<strong-password>

# Provision Cloud Storage bucket for uploads
gsutil mb -l europe-west2 gs://fabricate-uploads
```

### Build + deploy

```bash
# Build standalone bundle (Next.js produces .next/standalone/)
npm run build

# Build Docker image (need a Dockerfile — see below)
gcloud builds submit --tag gcr.io/genome-494016/fabricate-web

# Deploy with env vars + volume mount
gcloud run deploy fabricate-web \
  --image gcr.io/genome-494016/fabricate-web \
  --region europe-west2 \
  --platform managed \
  --allow-unauthenticated \
  --add-volume name=uploads,type=cloud-storage,bucket=fabricate-uploads \
  --add-volume-mount volume=uploads,mount-path=/data \
  --set-env-vars "DATA_DIR=/data,DATABASE_URL=...,..."
```

### Dockerfile

Add this at the project root:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Path C — Fly.io + Fly Postgres + Fly Volume

Cheap, simple, deploys via Docker. Persistent volumes built in.

```bash
fly launch
# accept defaults, set region to lhr (London)
fly postgres create --name fabricate-db --region lhr
fly postgres attach fabricate-db
fly volumes create uploads --size 10
fly secrets set AUTH_SECRET="..." STRIPE_SECRET_KEY="..." ...
fly deploy
```

In `fly.toml`, mount the volume and set `DATA_DIR=/data`.

---

## Storage decision matrix

| Host | Persistent volume? | What to set |
|---|---|---|
| Vercel | No | Need S3-compatible driver; `DATA_DIR` not used |
| Cloud Run + Cloud Storage | Yes (via FUSE mount) | `DATA_DIR=/data` |
| Fly.io | Yes (Fly volume) | `DATA_DIR=/data` |
| Hetzner / DigitalOcean / VPS | Yes (local FS) | `DATA_DIR=/var/fabricate/data` |

---

## Post-deploy verification

After the first deploy completes, walk these in order. Anything fails → roll back, fix, redeploy.

1. **Liveness:** `curl https://your-domain/api/healthz` → `{ "status": "ok", ... }`
2. **Readiness (DB):** `curl https://your-domain/api/readyz` → `{ "status": "ready", ... }`. If 503, the app can't reach Postgres; check `DATABASE_URL` and firewall rules.
3. **Static pages:** open `https://your-domain/`, `/terms`, `/privacy`, `/acceptable-use` — all 200, all render the legal markdown.
4. **Auth round-trip:** sign in via Google. Land back on the app with your name in the top nav. JWT should validate against `AUTH_TRUST_HOST=true`.
5. **Sign-up consent:** new account → `/legal/accept` → tick three boxes → continues.
6. **Maker onboarding (Stripe Identity):** navigate to `/maker/profile`, set up; go to `/maker/verification`, click "Verify identity with Stripe", complete the hosted flow; webhook fires, status flips to `id_verified` in DB.
7. **Maker onboarding (Stripe Connect):** `/maker/payouts` → "Connect payouts" → complete hosted Stripe form → return; `MakerProfile.stripeOnboarded` flips to `true`.
8. **Bid flow:** post a job from a creator account, accept a bid, watch the PaymentIntent capture in the Stripe live dashboard.
9. **File upload:** post a job with a real STL → confirm the file is retrievable from `https://your-domain/api/uploads/<id>.stl` and survives a redeploy.
10. **Notifications:** check Resend dashboard for the bid-placed transactional email.

---

## Rollback

The standalone Next.js bundle keeps the prior deployment cached on most hosts. Roll back via the host's UI:

- **Vercel:** Deployments → click prior → "Promote to production".
- **Cloud Run:** `gcloud run services update-traffic fabricate-web --to-revisions=PRIOR_REVISION=100`.
- **Fly:** `fly releases list`, then `fly deploy --image=<prior-image-tag>`.

DB migrations are not auto-rolled back. If a migration was applied that breaks production, you need a forward migration to fix it (or `prisma migrate resolve --rolled-back` + manual SQL undo).

---

## Maintenance after launch

- **Stripe webhook signing-secret rotation** every 90 days. Generate new secret in dashboard, update `STRIPE_IDENTITY_WEBHOOK_SECRET`, redeploy.
- **`AUTH_SECRET` rotation** every ~6 months. Forces all users to re-authenticate.
- **Postgres backups** — Cloud SQL has daily snapshots automatically; verify they exist. Fly + Vercel both auto-snapshot Fly Postgres / Vercel Postgres. Roll your own for self-hosted.
- **Prisma migrations** — never run `migrate dev` against production. Always `migrate deploy` from CI.
- **Logs** — Vercel / Cloud Run / Fly each have their own log explorer. Watch `[notify]`, `prisma:error`, and webhook signature errors as your top three things to alert on.
