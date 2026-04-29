# GCP one-time setup for Fabricate

Run this once to provision Cloud Run + Cloud SQL + Cloud Storage + the Workload Identity Federation that lets GitHub Actions deploy without a service-account JSON key. After this is done, every push to `main` deploys via `.github/workflows/deploy.yml`.

> **Pre-req:** install `gcloud` (`brew install --cask google-cloud-sdk`) and `gh` (`brew install gh`) on the machine you run this from. Authenticate: `gcloud auth login` and `gh auth login`.

## 0. Variables — set once, reuse below

```bash
export PROJECT_ID="genome-494016"            # confirm or change
export REGION="europe-west2"                  # London
export DB_INSTANCE="fabricate-prod"
export DB_NAME="fabricate"
export DB_USER="fabricate"
export DB_PASSWORD="$(openssl rand -base64 32 | tr -d '=+/')"
export AR_REPO="fabricate"
export BUCKET="fabricate-uploads"
export SERVICE="fabricate-web"
export DEPLOY_SA="fabricate-deploy"
export GITHUB_OWNER="helixdreamsco"
export GITHUB_REPO="fabricate"
```

## 1. Enable APIs

```bash
gcloud config set project $PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  secretmanager.googleapis.com
```

## 2. Cloud SQL (Postgres 16) in London

```bash
gcloud sql instances create $DB_INSTANCE \
  --database-version=POSTGRES_16 \
  --region=$REGION \
  --tier=db-f1-micro \
  --storage-type=SSD \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup \
  --backup-start-time=02:00

gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE
gcloud sql users create $DB_USER --instance=$DB_INSTANCE --password=$DB_PASSWORD

# Get the instance connection name (PROJECT:REGION:INSTANCE)
export CLOUD_SQL_CONNECTION="$(gcloud sql instances describe $DB_INSTANCE --format='value(connectionName)')"
echo "Cloud SQL connection: $CLOUD_SQL_CONNECTION"
echo "DB password (save in 1Password!): $DB_PASSWORD"
```

## 3. Artifact Registry (Docker images)

```bash
gcloud artifacts repositories create $AR_REPO \
  --repository-format=docker \
  --location=$REGION \
  --description="Fabricate container images"
```

## 4. Cloud Storage bucket for uploaded files

```bash
gsutil mb -l $REGION gs://$BUCKET

# Lifecycle: keep everything for now. Add deletion rules later if needed.
# Versioning ON so accidental deletes are recoverable.
gsutil versioning set on gs://$BUCKET
```

## 5. Service account that GitHub Actions assumes

```bash
gcloud iam service-accounts create $DEPLOY_SA \
  --display-name="Fabricate GitHub Actions deployer"

export DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant roles. Minimal set for build + push + deploy + migrate.
for role in \
    roles/run.admin \
    roles/cloudbuild.builds.editor \
    roles/artifactregistry.writer \
    roles/cloudsql.client \
    roles/storage.objectAdmin \
    roles/iam.serviceAccountUser \
    roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="$role"
done
```

## 6. Workload Identity Federation (GitHub → GCP, no JSON keys)

```bash
# Pool
gcloud iam workload-identity-pools create "github-actions" \
  --location="global" \
  --display-name="GitHub Actions"

export WIF_POOL_ID="$(gcloud iam workload-identity-pools describe github-actions --location=global --format='value(name)')"

# Provider — restricted to the helixdreamsco/fabricate repo
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-actions" \
  --display-name="GitHub provider" \
  --attribute-condition="assertion.repository == '${GITHUB_OWNER}/${GITHUB_REPO}'" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
  --issuer-uri="https://token.actions.githubusercontent.com"

export WIF_PROVIDER="${WIF_POOL_ID}/providers/github-provider"

# Allow GitHub Actions on this repo to impersonate the deploy SA
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA_EMAIL \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WIF_POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"

echo "WIF provider: $WIF_PROVIDER"
echo "Deploy SA: $DEPLOY_SA_EMAIL"
```

## 7. App secrets in Secret Manager

Cloud Run reads these at startup. Better than `--set-env-vars` because secrets are versioned, audited, and rotatable.

```bash
# Generate AUTH_SECRET (NextAuth JWT signing). Keep it safe — losing it
# logs every user out.
echo -n "$(openssl rand -base64 32)" | \
  gcloud secrets create AUTH_SECRET --data-file=-

# Database URL — Cloud Run connects via the unix socket Google mounts at
# /cloudsql/<connection-name> when `--add-cloudsql-instances` is set.
echo -n "postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION}" | \
  gcloud secrets create DATABASE_URL --data-file=-

# Stripe (live keys — paste yours, don't commit them anywhere)
echo -n "sk_live_PASTE_HERE" | gcloud secrets create STRIPE_SECRET_KEY --data-file=-
echo -n "pk_live_PASTE_HERE" | gcloud secrets create STRIPE_PUBLISHABLE_KEY --data-file=-
echo -n "whsec_PASTE_HERE" | gcloud secrets create STRIPE_IDENTITY_WEBHOOK_SECRET --data-file=-

# Google OAuth (production credentials, NOT dev)
echo -n "PASTE" | gcloud secrets create AUTH_GOOGLE_ID --data-file=-
echo -n "PASTE" | gcloud secrets create AUTH_GOOGLE_SECRET --data-file=-

# Resend (transactional email)
echo -n "re_PASTE" | gcloud secrets create RESEND_API_KEY --data-file=-
```

## 8. Initial Cloud Run deployment

The GitHub Action handles subsequent deploys, but the service has to exist first. Push an empty placeholder image so the resource shape is created.

```bash
# Build a temporary placeholder image so the service can be created
echo 'FROM gcr.io/cloudrun/hello' > /tmp/Dockerfile.bootstrap
gcloud builds submit /tmp \
  --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/fabricate-web:bootstrap \
  --config=- <<EOF
steps:
- name: gcr.io/cloud-builders/docker
  args: ['build', '-t', '${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/fabricate-web:bootstrap', '-f', '/tmp/Dockerfile.bootstrap', '/tmp']
- name: gcr.io/cloud-builders/docker
  args: ['push', '${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/fabricate-web:bootstrap']
images: ['${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/fabricate-web:bootstrap']
EOF

# Create the service with all wiring. Real images replace it on first deploy.
gcloud run deploy $SERVICE \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/fabricate-web:bootstrap \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances $CLOUD_SQL_CONNECTION \
  --add-volume name=uploads,type=cloud-storage,bucket=$BUCKET \
  --add-volume-mount volume=uploads,mount-path=/data \
  --set-env-vars "DATA_DIR=/data,NODE_ENV=production,AUTH_TRUST_HOST=true,NEXT_TELEMETRY_DISABLED=1" \
  --update-secrets="AUTH_SECRET=AUTH_SECRET:latest,DATABASE_URL=DATABASE_URL:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=STRIPE_PUBLISHABLE_KEY:latest,STRIPE_IDENTITY_WEBHOOK_SECRET=STRIPE_IDENTITY_WEBHOOK_SECRET:latest,AUTH_GOOGLE_ID=AUTH_GOOGLE_ID:latest,AUTH_GOOGLE_SECRET=AUTH_GOOGLE_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest" \
  --service-account $DEPLOY_SA_EMAIL \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80
```

Capture the URL Cloud Run prints. That's your temporary deploy URL until you point a domain at it.

## 9. Set GitHub repo secrets

```bash
cd ~/Desktop/fabricate   # or wherever the repo is
gh secret set GCP_PROJECT_ID --body "$PROJECT_ID"
gh secret set GCP_REGION --body "$REGION"
gh secret set GCP_WIF_PROVIDER --body "$WIF_PROVIDER"
gh secret set GCP_DEPLOY_SA --body "$DEPLOY_SA_EMAIL"
gh secret set GCP_AR_REPOSITORY --body "$AR_REPO"
gh secret set CLOUD_SQL_INSTANCE --body "$CLOUD_SQL_CONNECTION"
gh secret set CLOUD_RUN_SERVICE --body "$SERVICE"
gh secret set CLOUD_STORAGE_BUCKET --body "$BUCKET"
# DATABASE_URL the migrate step uses — proxy listens on localhost
gh secret set DATABASE_URL_MIGRATE \
  --body "postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?schema=public"
```

## 10. First real deploy

```bash
git push origin main
# OR trigger manually:
gh workflow run deploy.yml
gh run watch
```

Workflow output should show: build → push → migrate → deploy. Visit the Cloud Run URL — should land on Fabricate's homepage.

---

## Post-launch

- **Domain:** point `your-domain.com` at the Cloud Run service via Cloud Run Domain Mapping or Cloud Load Balancer + your DNS provider. Update `NEXT_PUBLIC_APP_URL` and `APP_URL` env vars on the service.
- **Stripe webhook:** create live webhook at `https://your-domain.com/api/webhooks/stripe-identity`, copy the new `whsec_…`, update `STRIPE_IDENTITY_WEBHOOK_SECRET` secret: `gcloud secrets versions add STRIPE_IDENTITY_WEBHOOK_SECRET --data-file=- <<< "whsec_NEW"`.
- **Google OAuth:** add the production redirect URI to your Google Cloud Console OAuth client.
- **Resend domain:** verify your domain at resend.com → Domains. Update `RESEND_FROM` env var.
- **Monitoring:** turn on Cloud Run uptime checks against `/api/healthz` and `/api/readyz`.

## Troubleshooting

- **Build fails with `Symlink ... invalid`** — check that `api/.venv` doesn't exist. The `.dockerignore` excludes it but a fresh `python -m venv` may recreate it.
- **`UntrustedHost` errors at runtime** — confirm `AUTH_TRUST_HOST=true` is set on the Cloud Run service.
- **`prisma migrate deploy` hangs in CI** — Cloud SQL Auth Proxy isn't connecting. Verify `CLOUD_SQL_INSTANCE` is the full `PROJECT:REGION:INSTANCE` form and the deploy SA has `roles/cloudsql.client`.
- **`P1001` Prisma can't connect** — `DATABASE_URL_MIGRATE` is wrong, or the proxy died. Check the workflow log around "Start Cloud SQL Auth Proxy".
- **502 on Cloud Run after deploy** — `AUTH_SECRET` not set or app crashed at startup. `gcloud run services logs tail $SERVICE --region $REGION`.
