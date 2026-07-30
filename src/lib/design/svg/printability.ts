/**
 * Will this logo survive being printed at the size the template gives it?
 *
 * FDM can't resolve a feature narrower than roughly a nozzle width. A logo
 * that looks crisp on screen becomes an unreadable smear when a 0.3 mm
 * hairline lands on the bed, so we measure the thinnest feature at real
 * print size and refuse to pretend it will be fine.
 *
 * The measurement is a rasterised distance probe rather than an exact medial
 * axis: we scan-fill the artwork at print scale and, for every filled cell,
 * find how far it is to the nearest empty cell. Twice the smallest such
 * distance over a stroke's spine is that stroke's width. That is approximate,
 * but it is conservative in the direction that matters (it never reports a
 * thin feature as thick) and it needs no polygon offsetting library.
 */
import type { LogoGeometry, Ring } from "./geometry";

/** Thinnest feature we'll print without complaint. */
export const MIN_FEATURE_MM = 1.0;
/** Raster resolution for the probe. Finer than the feature we're hunting. */
const SAMPLES_ACROSS = 240;
/**
 * Empty border cells around the raster.
 *
 * The raster covers the artwork's own bounds exactly, so without a margin the
 * artwork touches every edge and the space *outside* it is never represented.
 * The distance transform would then measure distance only to interior holes,
 * put its maxima on the border, and find no ridges at all.
 */
const PAD = 2;

export type PrintabilityReport = {
  /** Narrowest measured feature at the requested print size, in mm. */
  minFeatureMm: number;
  ok: boolean;
  /** Scale factor that would bring the thinnest feature up to the minimum. */
  scaleToFixt: number;
  /** Dilation in mm that would thicken the artwork enough, at this size. */
  thickenMm: number;
};

/**
 * Scan-fill the artwork into a raster of `cols`×`rows` cells surrounded by a
 * PAD-cell empty margin. Returned grid is (cols+2·PAD)×(rows+2·PAD).
 */
function makeMask(
  geo: LogoGeometry,
  cols: number,
  rows: number,
): { mask: Uint8Array; width: number; height: number } {
  const [minX, minY, maxX, maxY] = geo.bounds;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const width = cols + 2 * PAD;
  const height = rows + 2 * PAD;
  const mask = new Uint8Array(width * height);

  // Per-shape so each shape's own fill rule is honoured; shapes accumulate
  // by union, which is what overlapping marks in a logo mean.
  for (const shape of geo.shapes) {
    for (let py = 0; py < rows; py++) {
      // Sample at cell centres.
      const y = minY + ((py + 0.5) / rows) * spanY;
      // Gather crossings for this scanline across every ring in the shape.
      const crossings: Array<{ x: number; dir: number }> = [];
      for (const ring of shape.rings) {
        for (let i = 0; i + 3 < ring.length; i += 2) {
          const y0 = ring[i + 1];
          const y1 = ring[i + 3];
          if (y0 === y1) continue;
          if (y < Math.min(y0, y1) || y >= Math.max(y0, y1)) continue;
          const t = (y - y0) / (y1 - y0);
          crossings.push({
            x: ring[i] + t * (ring[i + 2] - ring[i]),
            dir: y1 > y0 ? 1 : -1,
          });
        }
      }
      if (!crossings.length) continue;
      crossings.sort((a, b) => a.x - b.x);

      // Walk left to right accumulating the rule's "insideness", filling the
      // gap after any crossing that leaves us inside. Same loop for both
      // rules — only the insideness test differs.
      let winding = 0;
      for (let c = 0; c + 1 < crossings.length; c++) {
        winding += crossings[c].dir;
        const inside =
          shape.fillRule === "evenodd" ? c % 2 === 0 : winding !== 0;
        if (inside) {
          fillSpan(
            mask, width, py, crossings[c].x, crossings[c + 1].x, minX, spanX, cols,
          );
        }
      }
    }
  }
  return { mask, width, height };
}

function fillSpan(
  mask: Uint8Array,
  width: number,
  py: number,
  xa: number,
  xb: number,
  minX: number,
  spanX: number,
  cols: number,
) {
  const from = Math.max(0, Math.ceil(((xa - minX) / spanX) * cols - 0.5));
  const to = Math.min(cols - 1, Math.floor(((xb - minX) / spanX) * cols - 0.5));
  const row = (py + PAD) * width;
  for (let px = from; px <= to; px++) mask[row + px + PAD] = 1;
}

/**
 * Chamfer distance transform: for each filled cell, distance in cells to the
 * nearest empty cell. Two passes, 3-4 chamfer weights — plenty for a
 * threshold check and far cheaper than an exact Euclidean transform.
 */
function distanceToEdge(mask: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e9;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) dist[i] = mask[i] ? INF : 0;

  const relax = (i: number, j: number, w: number) => {
    if (dist[j] + w < dist[i]) dist[i] = dist[j] + w;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (dist[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 3);
      if (y > 0) relax(i, i - width, 3);
      if (x > 0 && y > 0) relax(i, i - width - 1, 4);
      if (x < width - 1 && y > 0) relax(i, i - width + 1, 4);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (dist[i] === 0) continue;
      if (x < width - 1) relax(i, i + 1, 3);
      if (y < height - 1) relax(i, i + width, 3);
      if (x < width - 1 && y < height - 1) relax(i, i + width + 1, 4);
      if (x > 0 && y < height - 1) relax(i, i + width - 1, 4);
    }
  }
  // Chamfer weights are in thirds of a cell.
  for (let i = 0; i < dist.length; i++) dist[i] /= 3;
  return dist;
}

/**
 * Measure the narrowest feature when the artwork is scaled so its longest
 * side is `targetMm`.
 */
export function analysePrintability(
  geo: LogoGeometry,
  targetMm: number,
): PrintabilityReport {
  const [minX, minY, maxX, maxY] = geo.bounds;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const longest = Math.max(spanX, spanY);
  const mmPerUnit = targetMm / longest;

  // Keep cells square: a cell must be the same size in x and y or the
  // measured widths would depend on the artwork's aspect ratio.
  const cols = spanX >= spanY
    ? SAMPLES_ACROSS
    : Math.max(8, Math.round((spanX / spanY) * SAMPLES_ACROSS));
  const rows = spanY > spanX
    ? SAMPLES_ACROSS
    : Math.max(8, Math.round((spanY / spanX) * SAMPLES_ACROSS));

  const { mask, width, height } = makeMask(geo, cols, rows);
  const filled = mask.reduce((n, v) => n + v, 0);
  if (filled === 0) {
    return { minFeatureMm: 0, ok: false, scaleToFixt: 1, thickenMm: MIN_FEATURE_MM };
  }

  const dist = distanceToEdge(mask, width, height);

  // A stroke's half-width is the ridge of the distance field along its spine.
  // Taking the max over each connected stroke is the right idea, but the
  // cheap robust proxy is: for every filled cell, its distance is at most its
  // local half-width, so the *local maxima* are the spines. Use a high
  // percentile of local maxima to shrug off single-cell raster noise while
  // still catching a genuinely thin stroke.
  const ridges: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const d = dist[i];
      if (
        d >= dist[i - 1] && d >= dist[i + 1] &&
        d >= dist[i - width] && d >= dist[i + width]
      ) {
        ridges.push(d);
      }
    }
  }
  if (!ridges.length) {
    return { minFeatureMm: 0, ok: false, scaleToFixt: 1, thickenMm: MIN_FEATURE_MM };
  }
  ridges.sort((a, b) => a - b);
  // 10th percentile: the thinnest real feature, not the thinnest raster artefact.
  const p10 = ridges[Math.floor(ridges.length * 0.1)];

  // Cell size in mm — derived from the unpadded grid, which is what actually
  // covers the artwork.
  const cellMm = (spanX / cols) * mmPerUnit;
  const minFeatureMm = 2 * p10 * cellMm;

  const ok = minFeatureMm >= MIN_FEATURE_MM;
  return {
    minFeatureMm: Number(minFeatureMm.toFixed(3)),
    ok,
    scaleToFixt: ok ? 1 : Number((MIN_FEATURE_MM / minFeatureMm).toFixed(3)),
    thickenMm: ok ? 0 : Number((MIN_FEATURE_MM - minFeatureMm).toFixed(3)),
  };
}

/**
 * Thicken artwork by pushing every ring outward along its normals — the
 * one-click "thicken fine details" fix. Uses the same square-offset approach
 * as stroke outlining; overlaps at corners are resolved by the boolean union
 * downstream.
 */
export function thickenGeometry(geo: LogoGeometry, byUnits: number): LogoGeometry {
  const grow = (ring: Ring): Ring => {
    const n = ring.length / 2;
    if (n < 3) return ring;
    // Outward is +normal for a CCW ring, -normal for CW; using the signed
    // area keeps holes shrinking (which also thickens the solid between them).
    let area2 = 0;
    for (let i = 0; i + 3 < ring.length; i += 2) {
      area2 += ring[i] * ring[i + 3] - ring[i + 2] * ring[i + 1];
    }
    const sign = area2 >= 0 ? 1 : -1;
    const out = new Array<number>(ring.length);
    for (let i = 0; i < n; i++) {
      const px = ring[((i - 1 + n) % n) * 2], py = ring[((i - 1 + n) % n) * 2 + 1];
      const nx = ring[((i + 1) % n) * 2], ny = ring[((i + 1) % n) * 2 + 1];
      let dx = nx - px, dy = ny - py;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
      out[i * 2] = ring[i * 2] + -dy * byUnits * sign;
      out[i * 2 + 1] = ring[i * 2 + 1] + dx * byUnits * sign;
    }
    return out;
  };

  const shapes = geo.shapes.map((s) => ({
    fillRule: s.fillRule,
    rings: s.rings.map(grow),
  }));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    for (const r of s.rings) {
      for (let i = 0; i + 1 < r.length; i += 2) {
        if (r[i] < minX) minX = r[i];
        if (r[i] > maxX) maxX = r[i];
        if (r[i + 1] < minY) minY = r[i + 1];
        if (r[i + 1] > maxY) maxY = r[i + 1];
      }
    }
  }
  return {
    shapes,
    bounds: [minX, minY, maxX, maxY],
    autoOutlined: geo.autoOutlined,
  };
}
