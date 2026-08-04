/**
 * Filament mass estimation from mesh geometry.
 *
 * FDM parts are hollow: a solid-looking print is a thin shell around a
 * sparse lattice. Pricing off solid volume — which is what this used to do
 * — overstates a chunky part by 40-50%. A 419cm³ phone speaker quoted 208g
 * against a real slice of ~140g.
 *
 * The model here is shell + infill: perimeters and the solid top/bottom
 * layers average out to a wall of roughly constant thickness, and whatever
 * volume is left inside gets filled at the infill density.
 *
 * This is still an estimate. The authoritative number comes from slicing
 * the mesh server-side (`POST /api/py/quote`), which is what the
 * "engine verified" badge in the breakdown means. This exists so the
 * configure page has a defensible number to show in the ~1s before the
 * slicer answers, and a fallback when it can't.
 */

/**
 * Average wall thickness — two 0.4mm perimeters plus the amortised
 * contribution of solid top/bottom layers over a typical part.
 */
export const WALL_THICKNESS_MM = 0.9;

/**
 * Purge, prime line, skirt, and the fact that nobody's spool is calibrated.
 * Slicers report the filament they plan to extrude; reality runs a little
 * over.
 */
export const WASTE_FACTOR = 1.07;

/** Infill used when the caller has no user-selected value. */
export const DEFAULT_INFILL_FRACTION = 0.15;

/**
 * Grams of filament for one part.
 *
 * `ratePerGram` deliberately isn't in here — mass is geometry, price is
 * commercial. See `materialCostGbp`.
 */
export function estimateFilamentGrams({
  volumeCm3,
  surfaceAreaCm2,
  infillFraction,
  densityGPerCm3,
  wallThicknessMm = WALL_THICKNESS_MM,
  wasteFactor = WASTE_FACTOR,
}: {
  /** Enclosed volume of the mesh. */
  volumeCm3: number;
  /** Total triangle area of the mesh. */
  surfaceAreaCm2: number;
  /** 0.15 for 15% infill. */
  infillFraction: number;
  densityGPerCm3: number;
  wallThicknessMm?: number;
  wasteFactor?: number;
}): number {
  if (volumeCm3 <= 0) return 0;

  const printedVolumeCm3 = printedVolumeCm3For({
    volumeCm3,
    surfaceAreaCm2,
    infillFraction,
    wallThicknessMm,
  });
  return printedVolumeCm3 * densityGPerCm3 * wasteFactor;
}

/** Volume of plastic actually extruded, before density and waste. */
export function printedVolumeCm3For({
  volumeCm3,
  surfaceAreaCm2,
  infillFraction,
  wallThicknessMm = WALL_THICKNESS_MM,
}: {
  volumeCm3: number;
  surfaceAreaCm2: number;
  infillFraction: number;
  wallThicknessMm?: number;
}): number {
  if (volumeCm3 <= 0) return 0;

  const area = surfaceAreaCm2 > 0 ? surfaceAreaCm2 : approxSurfaceAreaCm2(volumeCm3);
  // mm → cm so the product lands in cm³ alongside volume.
  const shellVolumeCm3 = Math.min(area * (wallThicknessMm / 10), volumeCm3);
  // Thin-walled parts (a vase, a phone case) are all shell — the clamp above
  // means the interior term goes to zero rather than negative.
  const interiorCm3 = volumeCm3 - shellVolumeCm3;
  const fill = Math.min(1, Math.max(0, infillFraction));
  return shellVolumeCm3 + interiorCm3 * fill;
}

/**
 * Surface area of a cube of the same volume. Only used when the real area
 * is unavailable — a STEP file that failed to tessellate, or a design job
 * that carries mass but no mesh. Wrong for anything spindly (which has far
 * more surface per unit volume, so this under-reads), but it beats treating
 * the part as having no shell at all.
 */
export function approxSurfaceAreaCm2(volumeCm3: number): number {
  if (volumeCm3 <= 0) return 0;
  return 6 * Math.cbrt(volumeCm3) ** 2;
}

/**
 * Material line cost.
 *
 * The rate is an argument, not a constant: today it's the platform default
 * from the catalogue, but makers will set their own filament rates and this
 * has to take theirs without the maths changing.
 */
export function materialCostGbp(grams: number, ratePerGramGbp: number): number {
  return grams * ratePerGramGbp;
}
