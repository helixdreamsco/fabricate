import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import jscad from "@jscad/modeling";
import type { Geom2 } from "@jscad/modeling/src/geometries/geom2";
// @ts-expect-error — no types published for stl-serializer
import stlSerializer from "@jscad/stl-serializer";
import svgpath from "svgpath";

const { primitives, transforms, booleans, extrusions, expansions, geometries } = jscad;
const { cuboid } = primitives;
const { translate } = transforms;
const { subtract, union } = booleans;
const { extrudeLinear } = extrusions;
const { offset } = expansions;
const { geom2 } = geometries;

const FONT_PATH = path.join(process.cwd(), "src/lib/test-print/font.ttf");

export const STRIP_LENGTH_MM = 80;
export const STRIP_WIDTH_MM = 20;
export const STRIP_THICKNESS_MM = 2;
const CUT_Z_MARGIN_MM = 0.4;
const HORIZONTAL_PADDING_MM = 6;
const MAX_FONT_SIZE_MM = 10;
const BEZIER_STEPS = 16;

const CODE_PATTERN = /^[A-Z0-9-]{1,16}$/;

let cachedFont: opentype.Font | null = null;
function loadFont(): opentype.Font {
  if (!cachedFont) cachedFont = opentype.loadSync(FONT_PATH);
  return cachedFont;
}

export function isValidCode(raw: string): boolean {
  return CODE_PATTERN.test(raw.toUpperCase());
}

type Pt = [number, number];

function pathToSubpaths(opentypePath: opentype.Path): Pt[][] {
  const subpaths: Pt[][] = [];
  let current: Pt[] = [];
  for (const cmd of opentypePath.commands) {
    if (cmd.type === "M") {
      if (current.length > 2) subpaths.push(current);
      current = [[cmd.x, -cmd.y]];
    } else if (cmd.type === "L") {
      current.push([cmd.x, -cmd.y]);
    } else if (cmd.type === "Q") {
      const start = current[current.length - 1];
      for (let i = 1; i <= BEZIER_STEPS; i++) {
        const t = i / BEZIER_STEPS;
        const mt = 1 - t;
        const x = mt * mt * start[0] + 2 * mt * t * cmd.x1 + t * t * cmd.x;
        const y = mt * mt * start[1] + 2 * mt * t * -cmd.y1 + t * t * -cmd.y;
        current.push([x, y]);
      }
    } else if (cmd.type === "C") {
      const start = current[current.length - 1];
      for (let i = 1; i <= BEZIER_STEPS; i++) {
        const t = i / BEZIER_STEPS;
        const mt = 1 - t;
        const x =
          mt * mt * mt * start[0] +
          3 * mt * mt * t * cmd.x1 +
          3 * mt * t * t * cmd.x2 +
          t * t * t * cmd.x;
        const y =
          mt * mt * mt * start[1] +
          3 * mt * mt * t * -cmd.y1 +
          3 * mt * t * t * -cmd.y2 +
          t * t * t * -cmd.y;
        current.push([x, y]);
      }
    } else if (cmd.type === "Z") {
      if (current.length > 2) subpaths.push(current);
      current = [];
    }
  }
  if (current.length > 2) subpaths.push(current);

  return subpaths
    .map((sp) => {
      const dedup: Pt[] = [];
      for (const p of sp) {
        const last = dedup[dedup.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-5) dedup.push(p);
      }
      if (dedup.length > 2) {
        const first = dedup[0];
        const last = dedup[dedup.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-5) dedup.pop();
      }
      return dedup;
    })
    .filter((sp) => sp.length > 2);
}

function signedArea(points: Pt[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return area / 2;
}

function ensureCCW(points: Pt[]): Pt[] {
  return signedArea(points) < 0 ? [...points].reverse() : points;
}

function pointInPolygon(point: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function svgToSubpaths(svg: string): Pt[][] {
  const pathRe = /<path\b([^>]*)>/g;
  const subpaths: Pt[][] = [];

  for (const m of svg.matchAll(pathRe)) {
    const attrs = m[1];
    const fill = /\bfill="([^"]*)"/.exec(attrs)?.[1];
    if (fill === "none") continue;
    const d = /\bd="([^"]+)"/.exec(attrs)?.[1];
    if (!d) continue;

    let current: Pt[] = [];
    svgpath(d)
      .abs()
      .unarc()
      .iterate((seg, _idx, x, y) => {
        const cmd = seg[0];
        if (cmd === "M") {
          if (current.length > 2) subpaths.push(current);
          current = [[seg[1] as number, -(seg[2] as number)]];
        } else if (cmd === "L") {
          current.push([seg[1] as number, -(seg[2] as number)]);
        } else if (cmd === "H") {
          current.push([seg[1] as number, -y]);
        } else if (cmd === "V") {
          current.push([x, -(seg[1] as number)]);
        } else if (cmd === "C") {
          const x1 = seg[1] as number, y1 = seg[2] as number;
          const x2 = seg[3] as number, y2 = seg[4] as number;
          const ex = seg[5] as number, ey = seg[6] as number;
          for (let i = 1; i <= BEZIER_STEPS; i++) {
            const t = i / BEZIER_STEPS;
            const mt = 1 - t;
            const px =
              mt * mt * mt * x +
              3 * mt * mt * t * x1 +
              3 * mt * t * t * x2 +
              t * t * t * ex;
            const py =
              mt * mt * mt * y +
              3 * mt * mt * t * y1 +
              3 * mt * t * t * y2 +
              t * t * t * ey;
            current.push([px, -py]);
          }
        } else if (cmd === "Q") {
          const x1 = seg[1] as number, y1 = seg[2] as number;
          const ex = seg[3] as number, ey = seg[4] as number;
          for (let i = 1; i <= BEZIER_STEPS; i++) {
            const t = i / BEZIER_STEPS;
            const mt = 1 - t;
            const px = mt * mt * x + 2 * mt * t * x1 + t * t * ex;
            const py = mt * mt * y + 2 * mt * t * y1 + t * t * ey;
            current.push([px, -py]);
          }
        } else if (cmd === "Z") {
          if (current.length > 2) subpaths.push(current);
          current = [];
        }
      });
    if (current.length > 2) subpaths.push(current);
  }

  return subpaths
    .map((sp) => {
      const dedup: Pt[] = [];
      for (const p of sp) {
        const last = dedup[dedup.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-5) dedup.push(p);
      }
      if (dedup.length > 2) {
        const first = dedup[0];
        const last = dedup[dedup.length - 1];
        if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-5) dedup.pop();
      }
      return dedup;
    })
    .filter((sp) => sp.length > 2);
}

function buildStencilStl(
  rawSubpaths: Pt[][],
  opts: {
    padX: number;
    padY: number;
    allowScaleUp: boolean;
    /** Positive value bloats every contour — used to thicken text strokes
     *  so they survive a typical 0.4mm nozzle. 0 leaves geometry untouched
     *  (used for raw SVG artwork). */
    expandMm: number;
  },
): Buffer {
  if (rawSubpaths.length === 0) {
    throw new Error("No contours to engrave.");
  }

  const allPoints = rawSubpaths.flat();
  const minX = Math.min(...allPoints.map((p) => p[0]));
  const maxX = Math.max(...allPoints.map((p) => p[0]));
  const minY = Math.min(...allPoints.map((p) => p[1]));
  const maxY = Math.max(...allPoints.map((p) => p[1]));
  const w = maxX - minX;
  const h = maxY - minY;

  const usableW = STRIP_LENGTH_MM - 2 * opts.padX;
  const usableH = STRIP_WIDTH_MM - 2 * opts.padY;
  const fitScale = Math.min(usableW / w, usableH / h);
  const scale = opts.allowScaleUp ? fitScale : Math.min(fitScale, 1);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const subpaths: Pt[][] = rawSubpaths.map((sp) =>
    sp.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale] as Pt),
  );

  const depths = subpaths.map((sp, i) => {
    let d = 0;
    for (let j = 0; j < subpaths.length; j++) {
      if (i !== j && pointInPolygon(sp[0], subpaths[j])) d++;
    }
    return d;
  });

  const solidPieces: Geom2[] = [];
  const holePieces: Geom2[] = [];
  for (let i = 0; i < subpaths.length; i++) {
    const g = geom2.fromPoints(ensureCCW(subpaths[i]));
    if (depths[i] % 2 === 0) solidPieces.push(g);
    else holePieces.push(g);
  }

  let stencil2d =
    solidPieces.length === 1 ? solidPieces[0] : union(...solidPieces);
  if (holePieces.length) stencil2d = subtract(stencil2d, ...holePieces);

  if (opts.expandMm > 0) {
    stencil2d = offset(
      { delta: opts.expandMm, corners: "round", segments: 8 },
      stencil2d,
    );
  }

  const cutHeight = STRIP_THICKNESS_MM + CUT_Z_MARGIN_MM * 2;
  let cut3d = extrudeLinear({ height: cutHeight }, stencil2d);
  cut3d = translate(
    [0, 0, -(STRIP_THICKNESS_MM / 2 + CUT_Z_MARGIN_MM)],
    cut3d,
  );

  const strip = cuboid({
    size: [STRIP_LENGTH_MM, STRIP_WIDTH_MM, STRIP_THICKNESS_MM],
  });
  const result = subtract(strip, cut3d);

  const buffers: ArrayBuffer[] = stlSerializer.serialize(
    { binary: true },
    result,
  );
  const total = buffers.reduce((n, b) => n + b.byteLength, 0);
  const out = Buffer.allocUnsafe(total);
  let byteOffset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), byteOffset);
    byteOffset += b.byteLength;
  }
  return out;
}

export function generateTestStripStl(rawCode: string): Buffer {
  const code = rawCode.toUpperCase();
  if (!isValidCode(code)) {
    throw new Error(
      `Invalid code "${rawCode}" — must be 1-16 chars of A-Z, 0-9, or "-".`,
    );
  }
  const font = loadFont();
  const opentypePath = font.getPath(code, 0, 0, MAX_FONT_SIZE_MM);
  const subpaths = pathToSubpaths(opentypePath);
  return buildStencilStl(subpaths, {
    padX: HORIZONTAL_PADDING_MM,
    padY: 2,
    allowScaleUp: false,
    expandMm: 0.3,
  });
}

export function generateTestStripStlFromSvg(svg: string): Buffer {
  const subpaths = svgToSubpaths(svg);
  if (subpaths.length === 0) {
    throw new Error("No usable filled <path> elements found in SVG.");
  }
  return buildStencilStl(subpaths, {
    padX: 4,
    padY: 2,
    allowScaleUp: true,
    expandMm: 0,
  });
}
