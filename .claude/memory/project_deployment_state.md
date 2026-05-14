---
name: Fabricate production deployment state
description: Live infrastructure as of 2026-04-29 evening; what's running, what's pending, and what's left for Miles to do
type: project
originSessionId: 7cccfd4b-df44-4ef2-a72b-9fcdc3bd623c
---
Production app is **live** as of 2026-04-29 22:35 UTC. GitHub Actions deploy on every push to main works end-to-end.

## URLs

- **Cloud Run canonical:** https://fabricate-web-713924525022.europe-west2.run.app
- **Cloud Run alt:** https://fabricate-web-l3hfr3aggq-nw.a.run.app
- **Firebase Hosting proxy:** https://fabricate-helixdreams.web.app
- **Custom domain (cert validating, DNS propagated 2026-04-29 ~22:35):** https://fabricate.helixdreams.co

## GCP infrastructure (project `helixdreamsco-cd2a2`, region `europe-west2`)

- Cloud Run service: `fabricate-web` (autoscaling 0-10, 1 GB / 1 vCPU)
- Cloud SQL Postgres 16: `fabricate-prod`, db-f1-micro Enterprise edition, daily 02:00 backups, db `fabricate` + user `fabricate`
- Artifact Registry repo: `fabricate`
- Cloud Storage bucket: `fabricate-uploads` (versioning on, mounted at `/data` on Cloud Run)
- Cloud Build staging bucket: `713924525022_cloudbuild` (created manually because the SA couldn't auto-create)
- Service account: `fabricate-deploy@helixdreamsco-cd2a2.iam.gserviceaccount.com` with run.admin, cloudbuild.builds.editor, artifactregistry.writer, cloudsql.client, storage.objectAdmin, iam.serviceAccountUser, secretmanager.secretAccessor, serviceusage.serviceUsageConsumer
- Workload Identity Federation: pool `github-actions`, provider `github-provider`, scoped to `helixdreamsco/fabricate` repo only
- Firebase Hosting site: `fabricate-helixdreams` (proxies all paths to Cloud Run via `firebase.json` rewrite)

## Secret Manager (in `helixdreamsco-cd2a2`)

| Secret | Status | Notes |
|---|---|---|
| `AUTH_SECRET` | real | 32 random bytes, also at `/tmp/fabricate-auth-secret.txt` |
| `DATABASE_URL` | real | Unix socket via `--add-cloudsql-instances` |
| `AUTH_GOOGLE_ID` | real | OAuth client `27562408001-vlpftf9d0fesp8a57q7u0vuqld5tc4tu` (in `genome` project) |
| `AUTH_GOOGLE_SECRET` | real | matching client secret |
| `STRIPE_SECRET_KEY` | placeholder `REPLACE_ME` | needs live `sk_live_…` |
| `STRIPE_PUBLISHABLE_KEY` | placeholder | needs `pk_live_…` |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | placeholder | needs `whsec_…` from live webhook config |
| `RESEND_API_KEY` | placeholder | needs `re_…` from resend.com |

## GitHub repo secrets (https://github.com/helixdreamsco/fabricate/settings/secrets/actions)

All set. Workflow at `.github/workflows/deploy.yml` deploys on push to main.

## Local secret files (move to 1Password before next laptop reboot)

- `/tmp/fabricate-db-password.txt` — Cloud SQL postgres password
- `/tmp/fabricate-auth-secret.txt` — NextAuth JWT signing secret
- `/tmp/fabricate-gcp-vars.sh` — env var dump

## Where we paused 2026-04-29 evening

Custom domain `fabricate.helixdreams.co` DNS propagated, host + ownership active, cert in `CERT_VALIDATING` (Let's Encrypt working). Background poller `b2g7bunrc` was still running in the prior session. Should've completed by now; if not, check via:

```bash
TOKEN=$(gcloud auth print-access-token)
curl -sS -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: helixdreamsco-cd2a2" \
  "https://firebasehosting.googleapis.com/v1beta1/projects/helixdreamsco-cd2a2/sites/fabricate-helixdreams/customDomains/fabricate.helixdreams.co" | python3 -m json.tool
```

Look for `cert.state: CERT_ACTIVE`.

## Tomorrow's pickup order

1. **Verify cert is live** (poll command above). If still validating after 30 min, check the TXT record at registrar matches `jfhSRy3WPWi5CaZngeLvdcx6858kItxjDOT2i8FVLzU`.

2. **Update Cloud Run env vars** to point at the real domain:
   ```bash
   gcloud run services update fabricate-web --region europe-west2 \
     --update-env-vars "APP_URL=https://fabricate.helixdreams.co,NEXT_PUBLIC_APP_URL=https://fabricate.helixdreams.co"
   ```

3. **Tell Miles to update OAuth client** — add redirect URI `https://fabricate.helixdreams.co/api/auth/callback/google` at https://console.cloud.google.com/apis/credentials?project=genome → edit client `27562408001-vlpftf9d0fesp8a57q7u0vuqld5tc4tu`.

4. **Tell Miles to configure OAuth consent screen** — at https://console.cloud.google.com/apis/credentials/consent?project=genome:
   - App name `Fabricate`
   - Support email `helixdreamsco@gmail.com`
   - Authorized domain: `helixdreams.co`
   - Application home page: `https://fabricate.helixdreams.co`
   - Privacy policy link: `https://fabricate.helixdreams.co/privacy`
   - Terms of service link: `https://fabricate.helixdreams.co/terms`
   - Developer contact: `helixdreamsco@gmail.com`
   - PUBLISH APP (no Google verification needed for non-sensitive scopes — we only use openid/email/profile)

5. **Test sign-in end-to-end** at https://fabricate.helixdreams.co/account → click "Continue with Google" → should land back signed in.

6. **Continue down launch checklist:**
   - Stripe live keys (Miles has passport now, can do verification flow)
   - Stripe live webhook endpoint pointing at https://fabricate.helixdreams.co/api/webhooks/stripe-identity
   - Resend domain verification on `helixdreams.co` and API key
   - Insurance quote from Hiscox
   - Walk LAUNCH_CHECKLIST.md as a real user
