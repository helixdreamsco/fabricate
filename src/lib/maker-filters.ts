import type { Maker } from "./catalog";
import { haversineKm } from "./utils";

export type SortKey =
  | "nearest"
  | "shortest-queue"
  | "cheapest"
  | "highest-rated"
  | "most-compatible";

export const SORT_LABELS: Record<SortKey, string> = {
  nearest: "Nearest",
  "shortest-queue": "Shortest queue",
  cheapest: "Cheapest",
  "highest-rated": "Highest rated",
  "most-compatible": "Most compatible",
};

export type AnalysisLite = {
  volumeCm3: number;
  dimsMm: { x: number; y: number; z: number };
} | null;

export type MakerScore = Maker & {
  distanceKm: number;
  compatibility: {
    score: number;
    fits: boolean | null; // null when no analysis present
    supportsMaterial: boolean | null;
    supportsMultiMaterialIfNeeded: boolean | null;
  };
  indicativeGbp: number;
};

/** Generic reference model used pre-upload so the "cheapest" sort has signal. */
const REF_VOLUME_CM3 = 25;
const REF_TIME_MINUTES = REF_VOLUME_CM3 * 1.6;

export function scoreMakers({
  makers,
  user,
  analysis,
  preferredMaterial = "PLA",
  discountPct = 0,
  freeMode = false,
  needsMultiMaterial = false,
}: {
  makers: Maker[];
  user: { lat: number; lng: number };
  analysis: AnalysisLite;
  preferredMaterial?: string;
  discountPct?: number;
  freeMode?: boolean;
  /** Set true when the loaded file has more than one material/colour. */
  needsMultiMaterial?: boolean;
}): MakerScore[] {
  return makers.map((m) => {
    const distanceKm = haversineKm(user, { lat: m.lat, lng: m.lng });

    // Compatibility:
    //   - bbox fits the printer's build volume (when we have a real analysis)
    //   - printer is profiled for the preferred material
    //   - available + rating + versatility (# of materials supported)
    let fits: boolean | null = null;
    let supportsMaterial: boolean | null = null;
    if (analysis) {
      const dims = [
        analysis.dimsMm.x,
        analysis.dimsMm.y,
        analysis.dimsMm.z,
      ].sort((a, b) => b - a);
      const cap = [
        m.buildVolumeMm.x,
        m.buildVolumeMm.y,
        m.buildVolumeMm.z,
      ].sort((a, b) => b - a);
      fits = dims[0] <= cap[0] && dims[1] <= cap[1] && dims[2] <= cap[2];
    }
    supportsMaterial = m.materials.includes(preferredMaterial as never);

    const supportsMultiMaterialIfNeeded = needsMultiMaterial
      ? m.supportsMultiMaterial
      : null;

    const base =
      (m.available ? 50 : -50) +
      m.rating * 10 +
      m.materials.length * 5 +
      (supportsMaterial ? 20 : -40) +
      (fits === false ? -40 : fits === true ? 20 : 0) +
      (needsMultiMaterial && !m.supportsMultiMaterial ? -100 : 0);

    const score = base - distanceKm * 0.5 - m.queueMins * 0.1;

    // Indicative price (25 cm³ PLA) — used for the "cheapest" sort BEFORE the
    // user has uploaded. Post-upload this is overridden by the real quote.
    const refMaterialCost = REF_VOLUME_CM3 * 1.24 * 0.085; // PLA
    const refMachineCost = (REF_TIME_MINUTES / 60) * m.machineRateGbpPerHour;
    const refList = (refMaterialCost + refMachineCost) * 1.4;
    const refDiscounted = freeMode
      ? 0
      : refList * (1 - Math.max(0, Math.min(100, discountPct)) / 100);
    const indicativeGbp = refDiscounted + 1.5; // service fee, no delivery

    return {
      ...m,
      distanceKm,
      compatibility: {
        score,
        fits,
        supportsMaterial,
        supportsMultiMaterialIfNeeded,
      },
      indicativeGbp,
    };
  });
}

export function sortMakers(list: MakerScore[], key: SortKey): MakerScore[] {
  const copy = [...list];
  switch (key) {
    case "nearest":
      copy.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.distanceKm - b.distanceKm;
      });
      break;
    case "shortest-queue":
      copy.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.queueMins - b.queueMins;
      });
      break;
    case "cheapest":
      copy.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.indicativeGbp - b.indicativeGbp;
      });
      break;
    case "highest-rated":
      copy.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return b.rating - a.rating;
      });
      break;
    case "most-compatible":
      copy.sort((a, b) => b.compatibility.score - a.compatibility.score);
      break;
  }
  return copy;
}
