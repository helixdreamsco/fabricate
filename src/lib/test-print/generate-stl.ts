import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import jscad from "@jscad/modeling";
import type { Geom2 } from "@jscad/modeling/src/geometries/geom2";
// @ts-expect-error — no types published for stl-serializer
import stlSerializer from "@jscad/stl-serializer";

const { primitives, transforms, booleans, extrusions, geometries } = jscad;
const { cuboid } = primitives;
const { translate } = transforms;
const { subtract, union } = booleans;
const { extrudeLinear } = extrusions;
const { geom2 } = geometries;

const FONT_PATH = path.join(process.cwd(), "src/lib/test-print/font.ttf");

export const STRIP_LENGTH_MM = 80;
export const STRIP_WIDTH_MM = 20;
export const STRIP_THICKNESS_MM = 2;
export const ENGRAVE_DEPTH_MM = 1;
const HORIZONTAL_PADDING_MM = 6;
const MAX_FONT_SIZE_MM = 10;
const MIN_FONT_SIZE_MM = 4;
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

function chooseFontSize(font: opentype.Font, code: string, maxWidthMm: number): number {
  for (let size = MAX_FONT_SIZE_MM; size >= MIN_FONT_SIZE_MM; size -= 0.5) {
    const w = font.getAdvanceWidth(code, size);
    if (w <= maxWidthMm) return size;
  }
  return MIN_FONT_SIZE_MM;
}

export function generateTestStripStl(rawCode: string): Buffer {
  const code = rawCode.toUpperCase();
  if (!isValidCode(code)) {
    throw new Error(
      `Invalid code "${rawCode}" — must be 1-16 chars of A-Z, 0-9, or "-".`,
    );
  }

  const font = loadFont();
  const maxTextWidth = STRIP_LENGTH_MM - HORIZONTAL_PADDING_MM * 2;
  const fontSize = chooseFontSize(font, code, maxTextWidth);
  const opentypePath = font.getPath(code, 0, 0, fontSize);
  const subpaths = pathToSubpaths(opentypePath);

  if (subpaths.length === 0) {
    throw new Error("No glyph contours produced — font may be corrupted.");
  }

  const depths = subpaths.map((sp, i) => {
    let depth = 0;
    for (let j = 0; j < subpaths.length; j++) {
      if (i === j) continue;
      if (pointInPolygon(sp[0], subpaths[j])) depth++;
    }
    return depth;
  });

  const solidPieces: Geom2[] = [];
  const holePieces: Geom2[] = [];
  for (let i = 0; i < subpaths.length; i++) {
    const g = geom2.fromPoints(ensureCCW(subpaths[i]));
    if (depths[i] % 2 === 0) solidPieces.push(g);
    else holePieces.push(g);
  }

  let text2d =
    solidPieces.length === 1 ? solidPieces[0] : union(...solidPieces);
  if (holePieces.length) text2d = subtract(text2d, ...holePieces);

  const allPoints = subpaths.flat();
  const minX = Math.min(...allPoints.map((p) => p[0]));
  const maxX = Math.max(...allPoints.map((p) => p[0]));
  const minY = Math.min(...allPoints.map((p) => p[1]));
  const maxY = Math.max(...allPoints.map((p) => p[1]));

  const textHeight = ENGRAVE_DEPTH_MM + 0.4;
  let text3d = extrudeLinear({ height: textHeight }, text2d);

  const textCenterX = (minX + maxX) / 2;
  const textCenterY = (minY + maxY) / 2;
  const textZ = STRIP_THICKNESS_MM / 2 - ENGRAVE_DEPTH_MM;
  text3d = translate([-textCenterX, -textCenterY, textZ], text3d);

  const strip = cuboid({
    size: [STRIP_LENGTH_MM, STRIP_WIDTH_MM, STRIP_THICKNESS_MM],
  });
  const result = subtract(strip, text3d);

  const buffers: ArrayBuffer[] = stlSerializer.serialize({ binary: true }, result);
  const total = buffers.reduce((n, b) => n + b.byteLength, 0);
  const out = Buffer.allocUnsafe(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out;
}
