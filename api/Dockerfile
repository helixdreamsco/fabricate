# syntax=docker/dockerfile:1.7
# Fabricate FastAPI service (quotes, analysis, design generate/repair).
# Build with the REPOSITORY ROOT as context:
#   gcloud builds submit --config api/cloudbuild.yaml  (or)
#   docker build -f api/Dockerfile .
# The design endpoints read template specs and fonts from the repo root
# (DESIGN_REPO_ROOT), so those directories are baked into the image.

FROM python:3.12-slim-bookworm

# PrusaSlicer CLI for the slice-check stage. Headless use only — the Debian
# package drags in GUI libs but the CLI works without a display.
RUN apt-get update \
    && apt-get install -y --no-install-recommends prusa-slicer \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY api/app ./app
# Assets resolved via DESIGN_REPO_ROOT: template specs + engraving fonts.
COPY design ./repo/design
COPY public/fonts ./repo/public/fonts

ENV DESIGN_REPO_ROOT=/srv/repo \
    # matplotlib needs a writable config dir; the container runs read-only-ish
    MPLCONFIGDIR=/tmp/mpl \
    PYTHONUNBUFFERED=1

# Cloud Run injects PORT (default 8080).
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
