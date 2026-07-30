/**
 * Sanitised SVG → flat polygon rings.
 *
 * This runs ONCE, server-side, at upload. Both the browser preview and the
 * Python worker then extrude the rings this produces, rather than each
 * re-parsing the SVG with a different library. That is what makes the live
 * preview and the authoritative rebuild agree: there is only one parser, so
 * there is nothing for them to disagree about.
 *
 * Output units are viewBox units with y still pointing down (SVG's
 * convention). Consumers flip and scale — see `placeLogo`.
 */
import svgpath from "svgpath";
import {
  parseSanitised,
  SvgRejected,
  type SvgNode,
} from "./sanitise";

/** Flat [x0,y0,x1,y1,…] closed ring. */
export type Ring = number[];

export type LogoShape = {
  rings: Ring[];
  fillRule: "nonzero" | "evenodd";
};

export type LogoGeometry = {
  shapes: LogoShape[];
  /** Artwork bounds [minX, minY, maxX, maxY] in viewBox units. */
  bounds: [number, number, number, number];
  /** True when the source was stroke-only and we outlined it to get area. */
  autoOutlined: boolean;
};

/** Curve flattening tolerance, in viewBox units, relative to artwork size. */
const FLATTEN_SEGMENTS_PER_CURVE = 16;
/** Applied when a stroke-only path has no stroke-width of its own. */
export const DEFAULT_STROKE_WIDTH = 2;

// ---------------------------------------------------------------------------
// Primitive → path data
// ---------------------------------------------------------------------------

function num(node: SvgNode, name: string, fallback = 0): number {
  const v = Number.parseFloat(node.attrs[name] ?? "");
  return Number.isFinite(v) ? v : fallback;
}

/** Approximate a full ellipse with two arcs (unarc() turns them into curves). */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${cx - rx} ${cy}` +
    `A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}` +
    `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
  );
}

function pointsToPath(raw: string, close: boolean): string {
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  if (nums.length < 4) return "";
  const parts: string[] = [`M${nums[0]} ${nums[1]}`];
  for (let i = 2; i + 1 < nums.length; i += 2) parts.push(`L${nums[i]} ${nums[i + 1]}`);
  if (close) parts.push("Z");
  return parts.join("");
}

/** Path data for any drawable element, or "" if it has no geometry. */
function elementToPathData(node: SvgNode): string {
  switch (node.name) {
    case "path":
      return node.attrs["d"] ?? "";
    case "rect": {
      const x = num(node, "x"), y = num(node, "y");
      const w = num(node, "width"), h = num(node, "height");
      if (w <= 0 || h <= 0) return "";
      const rx = Math.min(num(node, "rx", num(node, "ry")), w / 2);
      const ry = Math.min(num(node, "ry", num(node, "rx")), h / 2);
      if (rx > 0 && ry > 0) {
        return (
          `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
          `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
          `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
          `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
        );
      }
      return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    }
    case "circle": {
      const r = num(node, "r");
      return r > 0 ? ellipsePath(num(node, "cx"), num(node, "cy"), r, r) : "";
    }
    case "ellipse": {
      const rx = num(node, "rx"), ry = num(node, "ry");
      return rx > 0 && ry > 0 ? ellipsePath(num(node, "cx"), num(node, "cy"), rx, ry) : "";
    }
    case "line":
      return `M${num(node, "x1")} ${num(node, "y1")}L${num(node, "x2")} ${num(node, "y2")}`;
    case "polyline":
      return pointsToPath(node.attrs["points"] ?? "", false);
    case "polygon":
      return pointsToPath(node.attrs["points"] ?? "", true);
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Flattening
// ---------------------------------------------------------------------------

function cubicAt(
  p0: number, p1: number, p2: number, p3: number, t: number,
): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/**
 * Walk absolute, arc-free, shorthand-free path data into closed rings.
 * Curves are sampled at a fixed segment count — determinism matters more than
 * adaptive subdivision here, because the same asset must produce the same
 * mesh on every rebuild.
 */
function flattenToRings(pathData: string): Ring[] {
  const rings: Ring[] = [];
  let current: number[] = [];
  let startX = 0, startY = 0;
  let cx = 0, cy = 0;

  const flush = () => {
    // Two points is enough: a bare line segment has no area to fill, but it
    // is a legitimate stroke and becomes a rectangle once outlined. Filled
    // shapes apply their own stricter threshold at the call site.
    if (current.length >= 4) rings.push(current);
    current = [];
  };

  svgpath(pathData)
    .abs()
    .unarc()
    .unshort()
    .iterate((seg) => {
      const cmd = seg[0] as string;
      switch (cmd) {
        case "M":
          flush();
          cx = startX = seg[1] as number;
          cy = startY = seg[2] as number;
          current = [cx, cy];
          break;
        case "L":
          cx = seg[1] as number;
          cy = seg[2] as number;
          current.push(cx, cy);
          break;
        case "H":
          cx = seg[1] as number;
          current.push(cx, cy);
          break;
        case "V":
          cy = seg[1] as number;
          current.push(cx, cy);
          break;
        case "C": {
          const [x1, y1, x2, y2, x, y] = seg.slice(1) as number[];
          for (let i = 1; i <= FLATTEN_SEGMENTS_PER_CURVE; i++) {
            const t = i / FLATTEN_SEGMENTS_PER_CURVE;
            current.push(cubicAt(cx, x1, x2, x, t), cubicAt(cy, y1, y2, y, t));
          }
          cx = x; cy = y;
          break;
        }
        case "Q": {
          const [qx, qy, x, y] = seg.slice(1) as number[];
          // Quadratic → cubic control points.
          const x1 = cx + (2 / 3) * (qx - cx);
          const y1 = cy + (2 / 3) * (qy - cy);
          const x2 = x + (2 / 3) * (qx - x);
          const y2 = y + (2 / 3) * (qy - y);
          for (let i = 1; i <= FLATTEN_SEGMENTS_PER_CURVE; i++) {
            const t = i / FLATTEN_SEGMENTS_PER_CURVE;
            current.push(cubicAt(cx, x1, x2, x, t), cubicAt(cy, y1, y2, y, t));
          }
          cx = x; cy = y;
          break;
        }
        case "Z":
        case "z":
          if (current.length >= 2) {
            current.push(startX, startY);
            flush();
          }
          cx = startX; cy = startY;
          break;
      }
    });
  flush();
  return rings;
}

// ---------------------------------------------------------------------------
// Stroke outlining
// ---------------------------------------------------------------------------

/**
 * Turn an open polyline into a closed ring by offsetting it either side —
 * a square-cap stroke outline. This is what rescues `fill="none"` logos,
 * which are pure outlines and have no area to extrude.
 *
 * Deliberately simple: no joins/miters, because the result is immediately
 * unioned with its neighbours by the extrusion stage and small overlaps at
 * corners disappear in the boolean.
 */
function outlineStroke(ring: Ring, width: number): Ring | null {
  const half = width / 2;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  if (pts.length < 2) return null;

  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
    // Normal is the direction rotated 90°.
    const nx = -dy * half;
    const ny = dx * half;
    left.push(pts[i][0] + nx, pts[i][1] + ny);
    right.push(pts[i][0] - nx, pts[i][1] - ny);
  }
  // Down one side, back the other.
  const out: number[] = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) out.push(right[i], right[i + 1]);
  out.push(left[0], left[1]);
  return out;
}

// ---------------------------------------------------------------------------
// Tree walk
// ---------------------------------------------------------------------------

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function parseTransform(raw: string | undefined): Matrix {
  if (!raw) return IDENTITY;
  let m: Matrix = IDENTITY;
  for (const [, fn, argsRaw] of raw.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const a = argsRaw.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    let next: Matrix = IDENTITY;
    switch (fn.toLowerCase()) {
      case "matrix":
        if (a.length === 6) next = a as Matrix;
        break;
      case "translate":
        next = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case "scale":
        next = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const rad = ((a[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (a.length >= 3) {
          next = multiply(
            multiply([1, 0, 0, 1, a[1], a[2]], rot),
            [1, 0, 0, 1, -a[1], -a[2]],
          );
        } else next = rot;
        break;
      }
      default:
        break; // skewX/skewY are rare in logos; ignoring is safe (identity)
    }
    m = multiply(m, next);
  }
  return m;
}

function applyMatrix(ring: Ring, m: Matrix): Ring {
  if (m === IDENTITY) return ring;
  const out = new Array<number>(ring.length);
  for (let i = 0; i + 1 < ring.length; i += 2) {
    out[i] = m[0] * ring[i] + m[2] * ring[i + 1] + m[4];
    out[i + 1] = m[1] * ring[i] + m[3] * ring[i + 1] + m[5];
  }
  return out;
}

const DRAWABLE = new Set([
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
]);

/** Inherited presentation state as we descend the tree. */
type Inherited = { fill?: string; stroke?: string; strokeWidth?: string; fillRule?: string };

function isNone(v: string | undefined): boolean {
  return (v ?? "").trim().toLowerCase() === "none";
}

/**
 * Extract polygon rings from sanitised SVG markup.
 *
 * `allowAutoOutline` controls the stroke-only path: when true, outline-only
 * artwork is converted to fills (and flagged); when false it is rejected so
 * the caller can offer the choice explicitly.
 */
export function extractGeometry(
  sanitisedSvg: string,
  { allowAutoOutline = true }: { allowAutoOutline?: boolean } = {},
): LogoGeometry {
  const root = parseSanitised(sanitisedSvg);
  const shapes: LogoShape[] = [];
  let sawStrokeOnly = false;
  let autoOutlined = false;

  const walk = (node: SvgNode, matrix: Matrix, inherited: Inherited) => {
    const local = multiply(matrix, parseTransform(node.attrs["transform"]));
    const state: Inherited = {
      fill: node.attrs["fill"] ?? inherited.fill,
      stroke: node.attrs["stroke"] ?? inherited.stroke,
      strokeWidth: node.attrs["stroke-width"] ?? inherited.strokeWidth,
      fillRule: node.attrs["fill-rule"] ?? inherited.fillRule,
    };

    if (DRAWABLE.has(node.name)) {
      const d = elementToPathData(node);
      if (d) {
        const rings = flattenToRings(d).map((r) => applyMatrix(r, local));
        // An unfilled element contributes nothing solid; if it is stroked we
        // can recover area by outlining, otherwise it is invisible.
        const filled = !isNone(state.fill);
        const stroked = !isNone(state.stroke) && state.stroke !== undefined;
        if (rings.length) {
          if (filled) {
            // A ring needs 3 distinct points to enclose anything.
            const areaRings = rings.filter((r) => r.length >= 6);
            if (areaRings.length) {
              shapes.push({
                rings: areaRings,
                fillRule:
                  (state.fillRule ?? "").toLowerCase() === "evenodd"
                    ? "evenodd"
                    : "nonzero",
              });
            }
          } else if (stroked) {
            sawStrokeOnly = true;
            if (allowAutoOutline) {
              const width = Math.abs(
                Number.parseFloat(state.strokeWidth ?? "") || DEFAULT_STROKE_WIDTH,
              );
              // Scale the stroke width by the transform so an outlined stroke
              // in a scaled group stays the right thickness.
              const scale = Math.sqrt(Math.abs(local[0] * local[3] - local[1] * local[2])) || 1;
              for (const ring of rings) {
                const outlined = outlineStroke(ring, width * scale);
                if (outlined) {
                  shapes.push({ rings: [outlined], fillRule: "nonzero" });
                  autoOutlined = true;
                }
              }
            }
          }
        }
      }
    }

    for (const child of node.children) walk(child, local, state);
  };

  // SVG's initial fill is black, so an element with no fill attribute at all
  // is filled — not invisible.
  walk(root, IDENTITY, { fill: "#000" });

  if (!shapes.length) {
    throw new SvgRejected(
      sawStrokeOnly ? "empty" : "empty",
      sawStrokeOnly
        ? "This logo is made of outlines with no fill, so there's nothing solid to print. Turn on “outline strokes” or re-export it with filled shapes."
        : "We couldn't find any printable shapes in that SVG.",
    );
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const shape of shapes) {
    for (const ring of shape.rings) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        if (ring[i] < minX) minX = ring[i];
        if (ring[i] > maxX) maxX = ring[i];
        if (ring[i + 1] < minY) minY = ring[i + 1];
        if (ring[i + 1] > maxY) maxY = ring[i + 1];
      }
    }
  }
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) {
    throw new SvgRejected("empty", "That logo has no printable area.");
  }

  return { shapes, bounds: [minX, minY, maxX, maxY], autoOutlined };
}

/** Signed area ×2 of a ring — sign gives winding, magnitude gives area. */
export function ringArea2(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i + 3 < ring.length; i += 2) {
    sum += ring[i] * ring[i + 3] - ring[i + 2] * ring[i + 1];
  }
  return sum;
}
