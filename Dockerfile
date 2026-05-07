# syntax=docker/dockerfile:1.7

# ── deps stage ───────────────────────────────────────────────────────────
# Install Node deps with the lockfile honoured. Cached aggressively — only
# rebuilds when package.json / package-lock.json change.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN apk add --no-cache libc6-compat openssl
RUN npm ci

# ── builder stage ────────────────────────────────────────────────────────
# Generate Prisma client + run `next build` to produce the standalone bundle.
# Does NOT need DATABASE_URL — Prisma generate just reads schema.prisma; the
# UntrustedHost warning during build is cosmetic and goes away in runtime.
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js inlines NEXT_PUBLIC_* env vars into the client bundle at build
# time. Cloud Run runtime env vars don't reach the build, so we accept
# them as build-args here. STRIPE_PUBLISHABLE_KEY is needed by the
# checkout flow (Stripe Elements init) and the TEST MODE badge gating.
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PROMO_NO_FEE
ENV NEXT_PUBLIC_PROMO_NO_FEE=$NEXT_PUBLIC_PROMO_NO_FEE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── runner stage ─────────────────────────────────────────────────────────
# Production image. Copies only what the server needs.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Non-root user for the runtime — Cloud Run requires unprivileged execution
# anyway, and we want defence-in-depth for self-hosted variants.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fabricate

# Standalone output bundles the minimal node_modules + a server.js entry.
COPY --from=builder --chown=fabricate:nodejs /app/.next/standalone ./
COPY --from=builder --chown=fabricate:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=fabricate:nodejs /app/public ./public

# Files read at runtime via fs (font for STL engraving, legal markdown).
# next.config's outputFileTracingIncludes already handles these; we copy
# the directories explicitly as belt-and-braces because the standalone
# bundle's tracing is occasionally over-eager.
COPY --from=builder --chown=fabricate:nodejs /app/src/lib/test-print/font.ttf ./src/lib/test-print/font.ttf
COPY --from=builder --chown=fabricate:nodejs /app/src/content ./src/content

# Prisma client + the migration history (used by `prisma migrate deploy` in
# CI; runtime doesn't need migrations but does need the generated client).
COPY --from=builder --chown=fabricate:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=fabricate:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=fabricate:nodejs /app/prisma ./prisma

USER fabricate
EXPOSE 3000

# Cloud Run sets PORT=8080 by default; we honour whatever's set.
CMD ["node", "server.js"]
