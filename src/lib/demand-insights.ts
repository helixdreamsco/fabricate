/**
 * Aggregate demand-vs-supply metrics for the maker dashboard.
 *
 * Window: last 30 days of jobs. Privacy posture: aggregate counts only,
 * with a 3-job minimum before any per-material category surfaces in the
 * UI. Never exposes individual job titles, file names, or creator
 * identities — strictly counts.
 *
 * The maker-specific helper additionally filters to gaps the *signed-in
 * maker* could fill — i.e. an under-served category they don't currently
 * stock or serve.
 */

import { prisma } from "./prisma";
import { parsePrinterMaterials } from "./printers";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_JOBS_THRESHOLD = 3;

export type MaterialKey = "PLA" | "PETG" | "ABS" | "TPU";
const MATERIAL_KEYS: MaterialKey[] = ["PLA", "PETG", "ABS", "TPU"];

export type MaterialDemand = {
  material: MaterialKey;
  /** Recent jobs requesting this material as the primary OR an alternative. */
  jobsLast30d: number;
  /** Distinct active makers whose printer materials include this key. */
  activeMakers: number;
  /**
   * Demand pressure ratio: jobs / makers. Higher = more under-served. We
   * also compute a per-maker ratio downstream for ranking.
   */
  ratio: number;
};

export type AmsDemand = {
  /** Jobs that flagged isMultiMaterial=true in the window. */
  multiMaterialJobsLast30d: number;
  /** Total jobs in the window. */
  totalJobsLast30d: number;
  /** Active makers with at least one AMS-equipped printer. */
  amsMakers: number;
  /** Active makers total. */
  totalMakers: number;
};

export type DemandInsights = {
  materials: MaterialDemand[];
  ams: AmsDemand;
  /** When false, we don't have enough recent activity to draw conclusions. */
  hasEnoughSignal: boolean;
};

function parseAlts(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function computeDemandInsights(): Promise<DemandInsights> {
  const since = new Date(Date.now() - WINDOW_MS);

  // Pull only what we need; the analysis is in-memory but small.
  const [recentJobs, activeProfiles, allProfiles] = await Promise.all([
    prisma.job.findMany({
      where: { createdAt: { gte: since } },
      select: {
        material: true,
        materialAlternatives: true,
        isMultiMaterial: true,
      },
    }),
    prisma.makerProfile.findMany({
      where: { printers: { some: { active: true } } },
      select: {
        id: true,
        printers: { where: { active: true }, select: { materials: true, hasAMS: true } },
      },
    }),
    prisma.makerProfile.count(),
  ]);

  // Per-material counts.
  const materialJobCount = new Map<string, number>();
  for (const j of recentJobs) {
    const set = new Set<string>([j.material, ...parseAlts(j.materialAlternatives)]);
    for (const k of set) {
      materialJobCount.set(k, (materialJobCount.get(k) ?? 0) + 1);
    }
  }

  const materialMakerCount = new Map<string, number>();
  let amsMakers = 0;
  for (const p of activeProfiles) {
    const stocked = new Set<string>();
    let hasAms = false;
    for (const pr of p.printers) {
      if (pr.hasAMS) hasAms = true;
      for (const m of parsePrinterMaterials(pr.materials)) stocked.add(m);
    }
    if (hasAms) amsMakers += 1;
    for (const k of stocked) {
      materialMakerCount.set(k, (materialMakerCount.get(k) ?? 0) + 1);
    }
  }

  const materials: MaterialDemand[] = MATERIAL_KEYS.map((m) => {
    const jobs = materialJobCount.get(m) ?? 0;
    const makers = materialMakerCount.get(m) ?? 0;
    return {
      material: m,
      jobsLast30d: jobs,
      activeMakers: makers,
      ratio: makers === 0 ? jobs : jobs / makers,
    };
  });

  const multi = recentJobs.filter((j) => j.isMultiMaterial).length;
  const total = recentJobs.length;

  return {
    materials,
    ams: {
      multiMaterialJobsLast30d: multi,
      totalJobsLast30d: total,
      amsMakers,
      totalMakers: allProfiles,
    },
    hasEnoughSignal: total >= MIN_JOBS_THRESHOLD,
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
      activeMakers: number;
      makerStocks: boolean;
    }
  | {
      kind: "ams";
      multiMaterialJobsLast30d: number;
      amsMakers: number;
      totalMakers: number;
      makerHasAms: boolean;
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

  // Surface materials with ≥3 jobs and a high jobs:makers ratio that the
  // maker doesn't currently stock. Sorted by under-servedness.
  const materialGaps = insights.materials
    .filter((m) => m.jobsLast30d >= MIN_JOBS_THRESHOLD)
    .map((m) => ({
      ...m,
      makerStocks: makerStocked.has(m.material),
    }))
    .filter((m) => !m.makerStocks)
    .sort((a, b) => b.ratio - a.ratio);

  for (const m of materialGaps.slice(0, 3)) {
    gaps.push({
      kind: "material",
      material: m.material,
      jobsLast30d: m.jobsLast30d,
      activeMakers: m.activeMakers,
      makerStocks: false,
    });
  }

  // AMS gap: only if it's a meaningful share of demand and the maker
  // doesn't already have one.
  const { multiMaterialJobsLast30d, amsMakers, totalMakers, totalJobsLast30d } =
    insights.ams;
  if (
    multiMaterialJobsLast30d >= MIN_JOBS_THRESHOLD &&
    multiMaterialJobsLast30d / Math.max(1, totalJobsLast30d) >= 0.15 &&
    !makerHasAms
  ) {
    gaps.push({
      kind: "ams",
      multiMaterialJobsLast30d,
      amsMakers,
      totalMakers,
      makerHasAms: false,
    });
  }

  return { insights, gaps };
}
