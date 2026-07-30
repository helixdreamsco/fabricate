/**
 * SVG → polygon extraction and print-size feature checking.
 *
 * These cover the shapes real logos actually arrive in: several separate
 * marks, letter counters that must stay holes, outline-only artwork with no
 * fill, and hairlines that would print as mush.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { sanitiseSvg, SvgRejected } from "@/lib/design/svg/sanitise";
import { extractGeometry, ringArea2 } from "@/lib/design/svg/geometry";
import {
  analysePrintability,
  thickenGeometry,
  MIN_FEATURE_MM,
} from "@/lib/design/svg/printability";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "svg");
const load = (name: string) =>
  extractGeometry(sanitiseSvg(readFileSync(join(FIXTURES, `${name}.svg`), "utf8")).svg);

describe("geometry extraction", () => {
  it("keeps every mark of a multi-path logo separate", () => {
    const geo = load("logo-multipath");
    assert.equal(geo.shapes.length, 3);
    const [minX, minY, maxX, maxY] = geo.bounds;
    assert.ok(maxX - minX > 250, "bounds should span all three marks");
    assert.ok(maxY - minY > 60);
  });

  it("converts primitives (circle, polygon, rect) into rings", () => {
    const geo = load("logo-multipath");
    for (const shape of geo.shapes) {
      assert.ok(shape.rings.length >= 1);
      for (const ring of shape.rings) {
        assert.ok(ring.length >= 6, "a ring needs at least 3 points");
        assert.equal(ring.length % 2, 0);
      }
    }
  });

  it("keeps counters as separate rings with opposite winding", () => {
    // The O and the A each have an outer ring and an inner counter. If the
    // counter were dropped or wound the same way, the letter would print as
    // a filled blob.
    const geo = load("logo-counters");
    assert.equal(geo.shapes.length, 2);
    for (const shape of geo.shapes) {
      assert.equal(shape.fillRule, "evenodd");
      assert.equal(shape.rings.length, 2, "outer ring + counter");
      const [outer, inner] = shape.rings;
      assert.ok(
        Math.abs(ringArea2(outer)) > Math.abs(ringArea2(inner)),
        "the counter must be the smaller ring",
      );
    }
  });

  it("auto-outlines stroke-only artwork into printable area", () => {
    const geo = load("logo-stroke-only");
    assert.equal(geo.autoOutlined, true);
    assert.ok(geo.shapes.length >= 4, "each stroked path becomes a filled outline");
    for (const shape of geo.shapes) {
      assert.ok(Math.abs(ringArea2(shape.rings[0])) > 0, "outlined stroke must enclose area");
    }
  });

  it("rejects stroke-only artwork with a clear message when auto-outline is off", () => {
    const svg = sanitiseSvg(
      readFileSync(join(FIXTURES, "logo-stroke-only.svg"), "utf8"),
    ).svg;
    assert.throws(
      () => extractGeometry(svg, { allowAutoOutline: false }),
      (e: unknown) => {
        assert.ok(e instanceof SvgRejected);
        // The user needs to know what to do, not just that it failed.
        assert.match(e.friendly, /outline|fill/i);
        return true;
      },
    );
  });

  it("treats a missing fill attribute as filled, per the SVG default", () => {
    const svg = sanitiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1 H9 V9 H1 Z"/></svg>`,
    ).svg;
    const geo = extractGeometry(svg);
    assert.equal(geo.shapes.length, 1);
    assert.equal(geo.autoOutlined, false);
  });

  it("applies transforms, including nested ones", () => {
    const svg = sanitiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
         <g transform="translate(10,10)">
           <g transform="scale(2)"><rect x="0" y="0" width="5" height="5" fill="#000"/></g>
         </g>
       </svg>`,
    ).svg;
    const geo = extractGeometry(svg);
    const [minX, minY, maxX, maxY] = geo.bounds;
    assert.ok(Math.abs(minX - 10) < 1e-6, `minX was ${minX}`);
    assert.ok(Math.abs(minY - 10) < 1e-6, `minY was ${minY}`);
    assert.ok(Math.abs(maxX - 20) < 1e-6, `maxX was ${maxX}`);
    assert.ok(Math.abs(maxY - 20) < 1e-6, `maxY was ${maxY}`);
  });

  it("flattens curves deterministically — same input, same rings", () => {
    const svg = sanitiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 50 C 10 10, 90 10, 90 50 S 10 90 10 50 Z" fill="#000"/></svg>`,
    ).svg;
    const a = extractGeometry(svg);
    const b = extractGeometry(svg);
    // The server rebuilds from the stored asset on every order; if flattening
    // drifted, the reprint wouldn't match the preview.
    assert.deepEqual(a.shapes, b.shapes);
  });
});

describe("printability at print size", () => {
  it("passes a chunky logo at a normal logo area", () => {
    const report = analysePrintability(load("logo-simple"), 30);
    assert.equal(report.ok, true, `minFeature was ${report.minFeatureMm}mm`);
    assert.ok(report.minFeatureMm >= MIN_FEATURE_MM);
    assert.equal(report.scaleToFixt, 1);
  });

  it("flags a hairline logo instead of silently printing mush", () => {
    const report = analysePrintability(load("logo-hairline"), 30);
    assert.equal(report.ok, false);
    assert.ok(
      report.minFeatureMm < MIN_FEATURE_MM,
      `expected sub-1mm, got ${report.minFeatureMm}`,
    );
  });

  it("offers a scale factor that would actually fix it", () => {
    const geo = load("logo-hairline");
    const report = analysePrintability(geo, 30);
    assert.ok(report.scaleToFixt > 1);
    // Scaling the logo area by that factor should bring it up to the minimum.
    const fixed = analysePrintability(geo, 30 * report.scaleToFixt);
    assert.ok(
      fixed.minFeatureMm >= MIN_FEATURE_MM * 0.95,
      `after scaling, minFeature was ${fixed.minFeatureMm}`,
    );
  });

  it("offers a thicken amount that would actually fix it", () => {
    const geo = load("logo-hairline");
    const report = analysePrintability(geo, 30);
    assert.ok(report.thickenMm > 0);
    // Convert the mm dilation into viewBox units and re-measure.
    const [minX, minY, maxX, maxY] = geo.bounds;
    const unitsPerMm = Math.max(maxX - minX, maxY - minY) / 30;
    const thickened = thickenGeometry(geo, (report.thickenMm / 2) * unitsPerMm);
    const after = analysePrintability(thickened, 30);
    assert.ok(
      after.minFeatureMm > report.minFeatureMm,
      `thickening should widen features: ${report.minFeatureMm} -> ${after.minFeatureMm}`,
    );
  });

  it("scales its verdict with the print size", () => {
    const geo = load("logo-simple");
    // The same artwork on a tiny keyring tag can fail where a coaster passes.
    const big = analysePrintability(geo, 60);
    const tiny = analysePrintability(geo, 4);
    assert.ok(big.minFeatureMm > tiny.minFeatureMm);
    assert.equal(tiny.ok, false);
  });
});
