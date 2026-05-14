---
name: reference-cloud-scheduler-jobs
description: "Cloud Scheduler cron jobs running against Fabricate prod — names, schedules, what they hit"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 24e865aa-84a0-4ad8-bc10-c303dfd9eff4
---

GCP project `helixdreamsco-cd2a2`, location `europe-west2`. List with `gcloud scheduler jobs list --location=europe-west2`.

- **affiliate-payout-sweep** — daily 03:00 Europe/London. `POST https://fabricate.helixdreams.co/api/affiliate/payouts/sweep` with bearer `AFFILIATE_PAYOUT_SECRET`. See [[project-affiliate-program]].
- **reddit-monitor-sweep** — hourly on the hour. `POST https://fabricate.helixdreams.co/api/reddit-monitor/sweep` with bearer `REDDIT_MONITOR_SECRET`. See [[project-reddit-monitor]].

Manual trigger: `gcloud scheduler jobs run <name> --location=europe-west2`.

Secrets live in Secret Manager (`AFFILIATE_PAYOUT_SECRET`, `REDDIT_MONITOR_SECRET`); Cloud Run runtime SA `fabricate-deploy@helixdreamsco-cd2a2.iam.gserviceaccount.com` has `roles/secretmanager.secretAccessor` on both. They mount into the container via `--update-secrets` in `.github/workflows/deploy.yml`.
