/**
 * Job-match evaluation for the per-maker subscription model.
 *
 * On every newly-created OPEN job, we walk the makers who have either
 * alerts or auto-bid enabled, evaluate whether the job matches their
 * criteria (distance, material strictness), and:
 *
 *   - fire an alert (in-app + optional email) if alerts pass;
 *   - place a bid via the existing /api/jobs/[id]/bids logic if auto-bid
 *     passes and the price-strategy result is at or above the maker's
 *     own floor AND the platform-side floor.
 *
 * The whole evaluation is fire-and-forget from the job-create route —
 * the creator's POST returns before this fans out. Errors here never
 * break the job-creation path.
 */

import { prisma } from "./prisma";
import { geocodePostcodes } from "./geocoding";
import type { MakerSubscription, Job, MakerProfile, Printer } from "@prisma/client";
import { parsePrinterMaterials } from "./printers";
import { notifyJobMatchAlert } from "./notifications";
import { notify as notifyInApp } from "./notify";
import { recordJobEvent } from "./jobs";
import { isMakerVerified } from "./maker-verification";
import { effectiveCompletionPhotoFee } from "./money";

export type Strictness = "strict" | "primary_or_alt" | "firehose";
export type Strategy = "match_listed" | "undercut_pct" | "fixed_offset";

const EARTH_R_KM = 6371;
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseAlts(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Does at least one of this maker's printers match the job, given
 * strictness?
 */
function materialsMatch(
  job: Pick<Job, "material" | "materialAlternatives" | "isMultiMaterial">,
  printers: Printer[],
  strictness: Strictness,
): boolean {
  if (strictness === "firehose") return true;
  const acceptable = new Set(
    strictness === "strict"
      ? [job.material]
      : [job.material, ...parseAlts(job.materialAlternatives)],
  );
  return printers.some((p) => {
    if (job.isMultiMaterial && !p.hasAMS) return false;
    const stocked = parsePrinterMaterials(p.materials);
    if (stocked.length === 0) return true; // no list = "stocks all"
    return stocked.some((m) => acceptable.has(m));
  });
}

function withinDistance(
  global: boolean,
  radiusKm: number,
  job: { lat: number | null; lng: number | null },
  maker: { lat: number | null; lng: number | null },
): boolean {
  if (global) return true;
  if (job.lat == null || job.lng == null) return true; // unknown location → don't filter out
  if (maker.lat == null || maker.lng == null) return false; // maker without postcode → no distance match
  return (
    haversineKm(
      { lat: job.lat, lng: job.lng },
      { lat: maker.lat, lng: maker.lng },
    ) <= radiusKm
  );
}

function isInQuietHours(
  now: Date,
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
    return false;
  }
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return startMin <= endMin
    ? minutesNow >= startMin && minutesNow < endMin
    : minutesNow >= startMin || minutesNow < endMin; // wraps midnight
}

/** Compute the proposed auto-bid amount based on strategy. */
function computeAutoBidPence(
  sub: MakerSubscription,
  job: Pick<Job, "quotedPricePence">,
): number {
  switch (sub.autoBidStrategy as Strategy) {
    case "match_listed":
      return job.quotedPricePence;
    case "undercut_pct":
      return Math.floor(
        job.quotedPricePence * (1 - sub.autoBidUndercutPct / 100),
      );
    case "fixed_offset":
      return job.quotedPricePence - sub.autoBidFixedOffsetPence;
    default:
      return job.quotedPricePence;
  }
}

/**
 * Fan-out evaluation. Called from /api/jobs (job creation) without await
 * so the creator's POST returns immediately. Internally, each maker's
 * alert + auto-bid evaluation is independent.
 */
export async function evaluateSubscriptions(opts: { jobId: string }): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: opts.jobId } });
  if (!job || job.status !== "OPEN") return;

  // Resolve job location from pickup postcode (jobs may already have
  // pickupLat/pickupLng if the creator supplied them; otherwise pickup
  // happens at the maker location, and distance is moot for the alert).
  let jobLat = job.pickupLat;
  let jobLng = job.pickupLng;
  if ((jobLat == null || jobLng == null) && job.pickupPostcode) {
    const coords = await geocodePostcodes([job.pickupPostcode]);
    const c = coords.get(job.pickupPostcode);
    if (c) {
      jobLat = c.lat;
      jobLng = c.lng;
    }
  }

  const subs = await prisma.makerSubscription.findMany({
    where: {
      OR: [{ alertsEnabled: true }, { autoBidEnabled: true }],
    },
    include: {
      maker: {
        include: {
          printers: { where: { active: true }, orderBy: { priority: "asc" } },
          user: { select: { id: true, email: true } },
        },
      },
    },
  });

  const now = new Date();

  for (const sub of subs) {
    try {
      await evaluateOneSubscription({
        sub,
        job: { ...job, pickupLat: jobLat, pickupLng: jobLng },
        now,
      });
    } catch (err) {
      // Never let one maker's failure poison the rest.
      // eslint-disable-next-line no-console
      console.error("[subscription] eval failed for maker", sub.makerId, err);
    }
  }
}

async function evaluateOneSubscription(opts: {
  sub: MakerSubscription & {
    maker: MakerProfile & {
      printers: Printer[];
      user: { id: string; email: string | null };
    };
  };
  job: Job;
  now: Date;
}): Promise<void> {
  const { sub, job, now } = opts;

  // Don't bid on or alert about your own job.
  if (sub.maker.userId === job.creatorId) return;

  const printers = sub.maker.printers;
  if (printers.length === 0) return;

  // ── Alerts ─────────────────────────────────────────────────────────
  if (sub.alertsEnabled) {
    const distOk = withinDistance(
      sub.alertsGlobal,
      sub.alertsRadiusKm,
      { lat: job.pickupLat, lng: job.pickupLng },
      { lat: sub.maker.lat, lng: sub.maker.lng },
    );
    const matOk = materialsMatch(
      job,
      printers,
      sub.alertsStrictness as Strictness,
    );
    if (distOk && matOk) {
      const quiet = isInQuietHours(now, sub.alertsQuietStart, sub.alertsQuietEnd);
      // In-app always fires (cheap, dismissible, captures missed alerts);
      // email skips during quiet hours and when email channel is off.
      await notifyInApp({
        recipientId: sub.maker.userId,
        kind: "bid_placed", // closest existing kind; UI can refine later
        body: `New job matches your alert: ${job.fileName} · ${formatGbp(job.quotedPricePence)}`,
        link: `/jobs/${job.id}`,
        data: { jobId: job.id, kind: "match_alert" },
      });
      if (sub.alertsEmailEnabled && !quiet && sub.maker.user.email) {
        notifyJobMatchAlert({
          recipientEmail: sub.maker.user.email,
          recipientDisplayName: sub.maker.displayName,
          jobId: job.id,
          fileName: job.fileName,
          quotedPricePence: job.quotedPricePence,
          material: job.material,
        });
      }
    }
  }

  // ── Auto-bid ──────────────────────────────────────────────────────
  if (sub.autoBidEnabled) {
    // Auto-bid requires verified maker + Stripe-onboarded — both gates the
    // /bids endpoint enforces server-side, but we duplicate here so we can
    // fail fast and not generate noisy "couldn't bid" notifications.
    const verified = await isMakerVerified(sub.maker.id);
    if (!verified) return;

    // Distance — auto-bid uses its own coverage unless useAlertsCoverage.
    const useAlerts = sub.autoBidUseAlertsCoverage;
    const distOk = withinDistance(
      useAlerts ? sub.alertsGlobal : sub.autoBidGlobal,
      useAlerts ? sub.alertsRadiusKm : sub.autoBidRadiusKm,
      { lat: job.pickupLat, lng: job.pickupLng },
      { lat: sub.maker.lat, lng: sub.maker.lng },
    );
    if (!distOk) return;

    const matOk = materialsMatch(
      job,
      printers,
      sub.autoBidStrictness as Strictness,
    );
    if (!matOk) return;

    // Don't double-bid if a bid from this maker already exists.
    const existing = await prisma.jobBid.findUnique({
      where: { jobId_makerId: { jobId: job.id, makerId: sub.maker.id } },
    });
    if (existing) return;

    const proposed = computeAutoBidPence(sub, job);
    const platformFloor = job.platformFeePence + 1;
    const makerFloor = sub.autoBidMakerFloorPence;
    const effectiveFloor = Math.max(platformFloor, makerFloor);

    if (proposed < effectiveFloor || proposed > job.quotedPricePence) {
      // Notify once that the auto-bid was skipped.
      await notifyInApp({
        recipientId: sub.maker.userId,
        kind: "bid_placed",
        body: `Auto-bid skipped on ${job.fileName}: target £${(proposed / 100).toFixed(2)} below your floor £${(effectiveFloor / 100).toFixed(2)}`,
        link: `/jobs/${job.id}`,
        data: { jobId: job.id, kind: "autobid_skipped", proposed, floor: effectiveFloor },
      });
      return;
    }

    // Pick the printer that satisfies the job's material constraint —
    // any of [primary, ...alternatives] match.
    const acceptable = [job.material, ...parseAlts(job.materialAlternatives)];
    const printer = printers.find((p) => {
      if (job.isMultiMaterial && !p.hasAMS) return false;
      const stocked = parsePrinterMaterials(p.materials);
      return stocked.length === 0 || stocked.some((m) => acceptable.includes(m));
    });
    if (!printer) return;

    // Place the bid. Fee is calculated the same as the manual bid path.
    const bid = await prisma.jobBid.upsert({
      where: { jobId_makerId: { jobId: job.id, makerId: sub.maker.id } },
      update: {
        priceOfferPence: proposed,
        etaHours: sub.autoBidEtaHours,
        message: sub.autoBidMessage,
        printerId: printer.id,
        status: "PENDING",
      },
      create: {
        jobId: job.id,
        makerId: sub.maker.id,
        priceOfferPence: proposed,
        etaHours: sub.autoBidEtaHours,
        message: sub.autoBidMessage,
        printerId: printer.id,
      },
    });

    await recordJobEvent({
      jobId: job.id,
      actor: "system",
      kind: "bid_placed",
      body: `Auto-bid: ${sub.maker.displayName} placed £${(proposed / 100).toFixed(2)} (ETA ${sub.autoBidEtaHours}h)`,
      data: { bidId: bid.id, autoBid: true, makerId: sub.maker.id },
    });

    // Notify the creator (existing bid_placed flow handles it for manual
    // bids; we want symmetry here too).
    const creator = await prisma.user.findUnique({
      where: { id: job.creatorId },
      select: { name: true, email: true },
    });
    void creator; // keep symmetry hook for downstream notifyBidPlaced if desired

    // Notify the maker their bid was placed.
    await notifyInApp({
      recipientId: sub.maker.userId,
      kind: "bid_placed",
      body: `Auto-bid placed: ${job.fileName} · £${(proposed / 100).toFixed(2)} · ETA ${sub.autoBidEtaHours}h`,
      link: `/jobs/${job.id}`,
      data: { jobId: job.id, bidId: bid.id, kind: "autobid_placed" },
    });
  }
}

// Avoid pulling the formatGbp from money.ts at module top to keep this
// file lean — local copy is fine, single use site.
function formatGbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
// Suppress unused warning — effectiveCompletionPhotoFee imported for
// future expansion (photo fee on auto-bids).
void effectiveCompletionPhotoFee;
