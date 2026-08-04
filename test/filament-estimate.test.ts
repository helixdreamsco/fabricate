/**
 * Shell + infill filament estimation.
 *
 * Run: npm test
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  DEFAULT_INFILL_FRACTION,
  WALL_THICKNESS_MM,
  approxSurfaceAreaCm2,
  estimateFilamentGrams,
  materialCostGbp,
  printedVolumeCm3For,
} from "@/lib/filament";
import { MATERIAL_DENSITY_G_PER_CM3, MATERIAL_RATE_GBP_PER_GRAM } from "@/lib/catalog";
import { estimateQuote } from "@/lib/pricing";

const PLA = MATERIAL_DENSITY_G_PER_CM3.PLA;

/** 40mm cube: 4×4×4 = 64cm³ solid, 6×(4×4) = 96cm² of surface. */
const CUBE = { volumeCm3: 64, surfaceAreaCm2: 96 };

describe("estimateFilamentGrams", () => {
  it("estimates a 40mm PLA cube at 15% infill", () => {
    // shell   = 96cm² × 0.09cm        =  8.64 cm³
    // printed = 8.64 + (64−8.64)×0.15 = 16.94 cm³
    // grams   = 16.94 × 1.24 × 1.07   = 22.48 g
    const grams = estimateFilamentGrams({
      ...CUBE,
      infillFraction: 0.15,
      densityGPerCm3: PLA,
    });
    assert.ok(
      grams > 22 && grams < 23,
      `expected ~22.5g for a 40mm cube, got ${grams.toFixed(2)}g`,
    );
  });

  it("stays far below the solid mass it replaces", () => {
    // The bug this fixes: pricing a hollow print as though it were solid.
    const solidG = CUBE.volumeCm3 * PLA;
    const grams = estimateFilamentGrams({
      ...CUBE,
      infillFraction: 0.15,
      densityGPerCm3: PLA,
    });
    assert.ok(grams < solidG * 0.3, `${grams.toFixed(1)}g vs solid ${solidG.toFixed(1)}g`);
  });

  it("clamps to solid volume when the shell would exceed it", () => {
    // A 0.5mm-walled box: surface area × wall thickness overshoots the
    // enclosed volume, so the interior term must not go negative.
    const thinWalled = { volumeCm3: 2, surfaceAreaCm2: 400 };
    const printedVol = printedVolumeCm3For({
      ...thinWalled,
      infillFraction: 0.15,
    });
    assert.equal(printedVol, thinWalled.volumeCm3);

    const grams = estimateFilamentGrams({
      ...thinWalled,
      infillFraction: 0.15,
      densityGPerCm3: PLA,
    });
    // Never more than solid, and infill can't add on top of a full shell.
    assert.ok(grams <= thinWalled.volumeCm3 * PLA * 1.07 + 1e-9);
    assert.ok(grams > 0);
  });

  it("rises with infill and tops out at solid", () => {
    const at = (f: number) =>
      estimateFilamentGrams({ ...CUBE, infillFraction: f, densityGPerCm3: PLA });
    assert.ok(at(0) < at(0.15));
    assert.ok(at(0.15) < at(0.5));
    assert.ok(at(0.5) < at(1));
    // 100% infill is a solid part plus the waste buffer.
    assert.ok(Math.abs(at(1) - CUBE.volumeCm3 * PLA * 1.07) < 1e-6);
  });

  it("returns zero for a mesh with no volume", () => {
    assert.equal(
      estimateFilamentGrams({
        volumeCm3: 0,
        surfaceAreaCm2: 0,
        infillFraction: 0.15,
        densityGPerCm3: PLA,
      }),
      0,
    );
  });

  it("falls back to a cube approximation when area is unknown", () => {
    // A STEP file that failed to tessellate has volume but no triangles.
    const withArea = estimateFilamentGrams({
      ...CUBE,
      infillFraction: 0.15,
      densityGPerCm3: PLA,
    });
    const withoutArea = estimateFilamentGrams({
      volumeCm3: CUBE.volumeCm3,
      surfaceAreaCm2: 0,
      infillFraction: 0.15,
      densityGPerCm3: PLA,
    });
    // The fallback IS a cube, so for a cube it should agree exactly.
    assert.ok(Math.abs(withArea - withoutArea) < 1e-9);
    assert.ok(Math.abs(approxSurfaceAreaCm2(64) - 96) < 1e-9);
  });

  it("scales with density, not just geometry", () => {
    const pla = estimateFilamentGrams({
      ...CUBE,
      infillFraction: 0.15,
      densityGPerCm3: MATERIAL_DENSITY_G_PER_CM3.PLA,
    });
    const abs = estimateFilamentGrams({
      ...CUBE,
      infillFraction: 0.15,
      densityGPerCm3: MATERIAL_DENSITY_G_PER_CM3.ABS,
    });
    assert.ok(abs < pla, "ABS is less dense than PLA");
  });
});

describe("materialCostGbp", () => {
  it("takes the rate as an input so a maker rate can override it", () => {
    assert.ok(Math.abs(materialCostGbp(140, 0.045) - 6.3) < 1e-9);
    // Same grams, a maker charging more for their own spool.
    assert.ok(Math.abs(materialCostGbp(140, 0.06) - 8.4) < 1e-9);
  });
});

describe("estimateQuote material line", () => {
  const base = {
    material: "PLA" as const,
    quality: "standard" as const,
    infillPct: 15,
    quantity: 1,
    delivery: "pickup" as const,
  };

  it("prices the cube's material off the shell estimate", () => {
    const q = estimateQuote({ ...base, ...CUBE });
    assert.ok(q.weightG > 22 && q.weightG < 23);
    const expected = q.weightG * MATERIAL_RATE_GBP_PER_GRAM.PLA;
    assert.ok(Math.abs(q.materialCost - expected) < 1e-9);
  });

  it("multiplies weight by quantity", () => {
    const one = estimateQuote({ ...base, ...CUBE });
    const four = estimateQuote({ ...base, ...CUBE, quantity: 4 });
    assert.ok(Math.abs(four.weightG - one.weightG * 4) < 1e-9);
  });

  it("uses a known slicer mass when given one", () => {
    const q = estimateQuote({ ...base, ...CUBE, weightGPerPartOverride: 140 });
    assert.equal(q.weightG, 140);
    assert.ok(Math.abs(q.materialCost - 140 * MATERIAL_RATE_GBP_PER_GRAM.PLA) < 1e-9);
  });

  it("accepts a maker's own filament rate", () => {
    const platform = estimateQuote({ ...base, ...CUBE });
    const maker = estimateQuote({ ...base, ...CUBE, ratePerGramGbpOverride: 0.09 });
    assert.ok(maker.materialCost > platform.materialCost);
    assert.ok(Math.abs(maker.materialCost - maker.weightG * 0.09) < 1e-9);
  });

  it("defaults infill rather than treating 0% as hollow", () => {
    const zero = estimateQuote({ ...base, ...CUBE, infillPct: 0 });
    const fifteen = estimateQuote({ ...base, ...CUBE, infillPct: 15 });
    assert.ok(Math.abs(zero.weightG - fifteen.weightG) < 1e-9);
    assert.equal(DEFAULT_INFILL_FRACTION, 0.15);
  });
});

describe("constants", () => {
  it("keeps the documented wall thickness", () => {
    assert.equal(WALL_THICKNESS_MM, 0.9);
  });
});
