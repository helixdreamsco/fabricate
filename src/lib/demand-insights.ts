/**
 * Aggregate demand-vs-supply metrics for the maker dashboard.
 *
 * Demand: jobs *requested* in the last 30 days (count by primary
 * material).
 * Supply: bids *accepted* in the last 30 days on jobs of that primary
 * material — i.e. fulfilled supply, not theoretical printer capacity.
 *
 * The ratio (demand / supply) measures unfilled demand: 1.0 means the
 * market is clearing in that category, >1.0 means jobs are coming in
 * faster than makers are taking them. That's the real signal a maker
 * cares about.
 *
 * Privacy posture: aggregate counts only, with a 3-job minimum before
 * any per-material category surfaces in the UI.
 */

import { prisma } from "./prisma";
import { parsePrinterMaterials } from "./printers";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_JOBS_THRESHOLD = 3;

export type MaterialKey = "PLA" | "PETG" | "ABS" | "TPU";
const MATERIAL_KEYS: MaterialKey[] = ["PLA", "PETG", "ABS", "TPU"];

export type MaterialDemand = {
  material: MaterialKey;
  /** Jobs created in the window with this primary material. */
  jobsLast30d: number;
  /** Bids accepted in the window on jobs with this primary material. */
  acceptedBidsLast30d: number;
  /** Demand pressure: jobs / max(1, acceptedBids). 1.0 = clearing. */
  ratio: number;
};

export type AmsDemand = {
  /** Jobs in the window flagged isMultiMaterial=true. */
  multiMaterialJobsLast30d: number;
  /** Total jobs in the window. */
  totalJobsLast30d: number;
  /** Accepted bids in the window on multi-material jobs. */
  acceptedMultiMaterialBidsLast30d: number;
};

export type DemandInsights = {
  materials: MaterialDemand[];
  ams: AmsDemand;
  /** When false, we don't have enough recent activity to draw conclusions. */
  hasEnoughSignal: boolean;
};

export async function computeDemandInsights(): Promise<DemandInsights> {
  const since = new Date(Date.now() - WINDOW_MS);

  const [recentJobs, acceptedBids] = await Promise.all([
    prisma.job.findMany({
      where: { createdAt: { gte: since } },
      select: { material: true, isMultiMaterial: true },
    }),
    prisma.jobBid.findMany({
      where: { status: "ACCEPTED", updatedAt: { gte: since } },
      select: {
        job: { select: { material: true, isMultiMaterial: true } },
      },
    }),
  ]);

  const jobsByMaterial = new Map<string, number>();
  for (const j of recentJobs) {
    jobsByMaterial.set(j.material, (jobsByMaterial.get(j.material) ?? 0) + 1);
  }

  const acceptedByMaterial = new Map<string, number>();
  let acceptedMultiMaterial = 0;
  for (const b of acceptedBids) {
    const mat = b.job.material;
    acceptedByMaterial.set(mat, (acceptedByMaterial.get(mat) ?? 0) + 1);
    if (b.job.isMultiMaterial) acceptedMultiMaterial += 1;
  }

  const materials: MaterialDemand[] = MATERIAL_KEYS.map((m) => {
    const jobs = jobsByMaterial.get(m) ?? 0;
    const accepted = acceptedByMaterial.get(m) ?? 0;
    return {
      material: m,
      jobsLast30d: jobs,
      acceptedBidsLast30d: accepted,
      ratio: jobs / Math.max(1, accepted),
    };
  });

  const totalJobs = recentJobs.length;
  const multi = recentJobs.filter((j) => j.isMultiMaterial).length;

  return {
    materials,
    ams: {
      multiMaterialJobsLast30d: multi,
      totalJobsLast30d: totalJobs,
      acceptedMultiMaterialBidsLast30d: acceptedMultiMaterial,
    },
    hasEnoughSignal: totalJobs >= MIN_JOBS_THRESHOLD,
  };
}

/**
 * For a specific maker, return the highlights most actionable to *them*:
 * under-served categories they don't currently stock, plus the AMS gap if
 * they don't have one.
 */
export type MakerActionableGap =
  | {
      kind: "material";
      material: MaterialKey;
      jobsLast30d: number;
      acceptedBidsLast30d: number;
    }
  | {
      kind: "ams";
      multiMaterialJobsLast30d: number;
      acceptedMultiMaterialBidsLast30d: number;
    };

export async function computeMakerActionableGaps(opts: {
  makerId: string;
}): Promise<{ insights: DemandInsights; gaps: MakerActionableGap[] }> {
  const insights = await computeDemandInsights();

  const printers = await prisma.printer.findMany({
    where: { makerId: opts.makerId, active: true },
    select: { materials: true, hasAMS: true },
  });
  const makerStocked = new Set<string>();
  let makerHasAms = false;
  for (const p of printers) {
    if (p.hasAMS) makerHasAms = true;
    for (const m of parsePrinterMaterials(p.materials)) makerStocked.add(m);
  }

  if (!insights.hasEnoughSignal) {
    return { insights, gaps: [] };
  }

  const gaps: MakerActionableGap[] = [];

  // Surface materials with ≥3 jobs, demand > supply, and the maker
  // doesn't currently stock. Sort by under-servedness (highest ratio).
  const materialGaps = insights.materials
    .filter(
      (m) =>
        m.jobsLast30d >= MIN_JOBS_THRESHOLD &&
        m.jobsLast30d > m.acceptedBidsLast30d &&
        !makerStocked.has(m.material),
    )
    .sort((a, b) => b.ratio - a.ratio);

  for (const m of materialGaps.slice(0, 3)) {
    gaps.push({
      kind: "material",
      material: m.material,
      jobsLast30d: m.jobsLast30d,
      acceptedBidsLast30d: m.acceptedBidsLast30d,
    });
  }

  // AMS gap: only if multi-material jobs are ≥15% of recent demand AND
  // demand outpaces supply AND the maker doesn't already have an AMS.
  const { multiMaterialJobsLast30d, acceptedMultiMaterialBidsLast30d, totalJobsLast30d } =
    insights.ams;
  if (
    multiMaterialJobsLast30d >= MIN_JOBS_THRESHOLD &&
    multiMaterialJobsLast30d / Math.max(1, totalJobsLast30d) >= 0.15 &&
    multiMaterialJobsLast30d > acceptedMultiMaterialBidsLast30d &&
    !makerHasAms
  ) {
    gaps.push({
      kind: "ams",
      multiMaterialJobsLast30d,
      acceptedMultiMaterialBidsLast30d,
    });
  }

  return { insights, gaps };
}
