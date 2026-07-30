"use client";
import * as THREE from "three";
import { FontLoader, type Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ParamValues, TemplateSpec } from "../schema";
import { booleanMany } from "./csg";

/**
 * Cosmetic live preview: mirrors the server templates approximately.
 * The server rebuild from the parameter JSON is authoritative.
 * Units mm, Z-up (rotated for display by the viewer).
 */

// typeface.json versions generated from the bundled TTFs by
// scripts/ttf2typeface.mjs — the server uses the TTFs directly.
const FONT_FILES: Record<string, string> = {
  "sans-bold": "/fonts/DejaVuSans-Bold.typeface.json",
  "serif-bold": "/fonts/DejaVuSerif-Bold.typeface.json",
  "mono-bold": "/fonts/DejaVuSansMono-Bold.typeface.json",
};

const fontCache = new Map<string, Promise<Font>>();
function loadFont(fontId: string): Promise<Font> {
  if (!fontCache.has(fontId)) {
    fontCache.set(
      fontId,
      new FontLoader().loadAsync(FONT_FILES[fontId] ?? FONT_FILES["sans-bold"]),
    );
  }
  return fontCache.get(fontId)!;
}

/**
 * Icons are polygon-only SVGs (see public/icons) — parse `points` attributes
 * directly, exactly like the Python worker, with y negated to y-up and CCW
 * winding enforced. Each polygon stays a separate shape so overlapping
 * polygons can be unioned properly via Manifold.
 */
const iconCache = new Map<string, Promise<THREE.Shape[]>>();
function loadIconShapes(iconId: string): Promise<THREE.Shape[]> {
  if (!iconCache.has(iconId)) {
    iconCache.set(
      iconId,
      fetch(`/design-icons/${iconId}.svg`)
        .then((r) => r.text())
        .then((svg) => {
          const shapes: THREE.Shape[] = [];
          for (const match of svg.matchAll(/points="([^"]+)"/g)) {
            const nums = match[1].trim().split(/[\s,]+/).map(Number);
            const pts: THREE.Vector2[] = [];
            for (let i = 0; i + 1 < nums.length; i += 2) {
              pts.push(new THREE.Vector2(nums[i], -nums[i + 1]));
            }
            if (pts.length < 3) continue;
            if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
            shapes.push(new THREE.Shape(pts));
          }
          return shapes;
        }),
    );
  }
  return iconCache.get(iconId)!;
}

/**
 * Uploaded logo shapes, fetched by asset id.
 *
 * Deliberately fetches the POLYGONS the server extracted at upload, not the
 * SVG — re-parsing here with SVGLoader would be a second interpretation of
 * the same artwork and the preview could drift from what actually prints.
 */
type AssetGeometry = {
  shapes: Array<{ rings: number[][]; fillRule: "nonzero" | "evenodd" }>;
  bounds: [number, number, number, number];
};

const assetCache = new Map<string, Promise<THREE.Shape[]>>();

function ringToPoints(ring: number[]): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  // SVG y grows downward; negate to match the worker's y-up convention.
  for (let i = 0; i + 1 < ring.length; i += 2) {
    pts.push(new THREE.Vector2(ring[i], -ring[i + 1]));
  }
  return pts;
}

function ringArea(pts: THREE.Vector2[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function pointInRing(p: THREE.Vector2, ring: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].y, yj = ring[j].y;
    if (yi > p.y !== yj > p.y) {
      const x = ((ring[j].x - ring[i].x) * (p.y - yi)) / (yj - yi) + ring[i].x;
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

function loadAssetShapes(assetId: string): Promise<THREE.Shape[]> {
  if (!assetCache.has(assetId)) {
    assetCache.set(
      assetId,
      fetch(`/api/design/assets/${assetId}?format=geometry`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`asset ${r.status}`))))
        .then((data: { geometry: AssetGeometry }) => {
          const out: THREE.Shape[] = [];
          for (const shapeSpec of data.geometry.shapes) {
            const rings = shapeSpec.rings
              .map(ringToPoints)
              .filter((r) => r.length >= 3);
            if (!rings.length) continue;
            // Largest ring is the outline; anything inside it is a counter.
            // Matches how the worker resolves rings, so the two agree.
            rings.sort((a, b) => ringArea(b) - ringArea(a));
            const [outer, ...rest] = rings;
            if (THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
            const shape = new THREE.Shape(outer);
            for (const ring of rest) {
              const isHole = pointInRing(ring[0], outer);
              if (!isHole) {
                out.push(new THREE.Shape(ring));
                continue;
              }
              if (!THREE.ShapeUtils.isClockWise(ring)) ring.reverse();
              shape.holes.push(new THREE.Path(ring));
            }
            out.push(shape);
          }
          return out;
        })
        .catch((e) => {
          console.warn("logo preview unavailable", e);
          return [];
        }),
    );
  }
  return assetCache.get(assetId)!;
}

/** Scale + centre a group of geometries so the group's largest side fits. */
function fitGroup(
  geoms: THREE.BufferGeometry[],
  targetMm: number,
): THREE.BufferGeometry[] {
  const box = new THREE.Box3();
  for (const g of geoms) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const w = box.max.x - box.min.x;
  const h = box.max.y - box.min.y;
  const s = targetMm / Math.max(w, h, 1e-6);
  const cx = ((box.min.x + box.max.x) / 2) * s;
  const cy = ((box.min.y + box.max.y) / 2) * s;
  for (const g of geoms) {
    g.scale(s, s, 1);
    g.translate(-cx, -cy, 0);
  }
  return geoms;
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function extrude(shape: THREE.Shape | THREE.Shape[], depth: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
}

async function textGeometry(
  text: string,
  fontId: string,
  sizeMm: number,
  depth: number,
): Promise<THREE.BufferGeometry | null> {
  if (!text.trim()) return null;
  const font = await loadFont(fontId);
  const geo = new TextGeometry(text, {
    font,
    size: sizeMm,
    depth,
    curveSegments: 6,
    bevelEnabled: false,
  });
  geo.computeBoundingBox();
  return geo;
}

/** Scale + centre text to fit a width with margins; returns fitted geometry. */
function fitText(geo: THREE.BufferGeometry, maxWidth: number, maxHeight: number) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  const scale = Math.min(1, maxWidth / w, maxHeight / h);
  geo.scale(scale, scale, 1);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  geo.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, 0);
  return geo;
}

export interface PreviewResult {
  /** Base solid geometry (primary colour). */
  base: THREE.BufferGeometry;
  /** Relief overlay when boolean unavailable (accent colour), else null. */
  overlay: THREE.BufferGeometry | null;
  overlayMode: "emboss" | "deboss" | null;
}

/**
 * Merge heterogeneous geometries (indexed and non-indexed, differing
 * attributes) for display: strip to position-only, flat normals after.
 */
function displayMerge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geoms.length === 1) {
    const single = geoms[0];
    if (!single.attributes.normal) single.computeVertexNormals();
    return single;
  }
  const cleaned = geoms.map((g) => {
    const nonIndexed = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", nonIndexed.attributes.position.clone());
    return out;
  });
  const merged = mergeGeometries(cleaned)!;
  merged.computeVertexNormals();
  return merged;
}

/**
 * Boolean the relief onto ONE clean solid (`target`) — Manifold rejects
 * merged multi-shell geometry — then merge the untouched sibling solids
 * (`others`) back in for display only.
 */
async function applyRelief(
  target: THREE.BufferGeometry,
  relief: THREE.BufferGeometry | THREE.BufferGeometry[] | null,
  mode: string,
  others: THREE.BufferGeometry[] = [],
): Promise<PreviewResult> {
  const display = (t: THREE.BufferGeometry) => displayMerge([t, ...others]);
  const reliefParts =
    relief == null ? [] : Array.isArray(relief) ? relief : [relief];
  if (!reliefParts.length) {
    return { base: display(target), overlay: null, overlayMode: null };
  }
  const op = mode === "deboss" ? "subtract" : "union";
  const merged = await booleanMany(target, reliefParts, op);
  if (merged) return { base: display(merged), overlay: null, overlayMode: null };
  return {
    base: display(target),
    overlay: displayMerge(reliefParts),
    overlayMode: mode === "deboss" ? "deboss" : "emboss",
  };
}

export async function buildPreview(
  spec: TemplateSpec,
  params: ParamValues,
): Promise<PreviewResult> {
  const p = params as Record<string, string & number>;
  const relief = spec.constraints.reliefDepthMm;

  switch (spec.id) {
    case "keychain-text": {
      const length = Number(p.lengthMm), thick = Number(p.thicknessMm);
      const width = length * 0.42;
      const plate = extrude(roundedRectShape(length, width, 6), thick);
      const ring = new THREE.RingGeometry(3, 6, 32);
      const loop = extrude(
        (() => {
          const s = new THREE.Shape();
          s.absarc(0, 0, 6, 0, Math.PI * 2, false);
          const hole = new THREE.Path();
          hole.absarc(0, 0, 3, 0, Math.PI * 2, true);
          s.holes.push(hole);
          return s;
        })(),
        thick,
      );
      ring.dispose();
      loop.translate(-length / 2 - 3, 0, 0);
      let text = await textGeometry(String(p.text), String(p.font), width * 0.5, relief);
      if (text) {
        text = fitText(text, length - 8, width - 8);
        text.translate(0, 0, p.mode === "deboss" ? thick - relief : thick - 0.05);
      }
      return applyRelief(plate, text, String(p.mode), [loop]);
    }

    case "logo-keyring": {
      const width = Number(p.widthMm);
      const thick = Number(p.thicknessMm);
      const mode = String(p.mode);
      const isDogTag = p.shape === "dog-tag";
      const height = width * (isDogTag ? 0.72 : 0.62);
      const corner = isDogTag ? height / 2 : Math.min(width, height) * 0.18;

      // Body with the hanging hole punched out.
      const bodyShape = roundedRectShape(width, height, corner);
      const holeR = 2.5;
      const holeCy = height / 2 - 3 - holeR;
      const holePath = new THREE.Path();
      holePath.absarc(0, holeCy, holeR, 0, Math.PI * 2, true);
      bodyShape.holes.push(holePath);
      const body = extrude(bodyShape, thick);

      const faceTop = holeCy - holeR - 1.5;
      const faceBottom = -height / 2 + 2;
      const hasText = String(p.text ?? "").trim().length > 0;
      const textH = hasText ? spec.constraints.minTextHeightMm : 0;
      const logoTop = faceTop;
      const logoBottom = faceBottom + (hasText ? textH + 2 : 0);
      const logoSpan = Math.max(1, logoTop - logoBottom);

      // Cut-through goes right through the plate; relief sits on the face.
      const cutting = mode === "cut-through";
      const depth = cutting ? thick + 2 : relief + 1;
      const zBase = cutting ? -1 : mode === "deboss" ? thick - relief : thick - 1;

      const parts: THREE.BufferGeometry[] = [];
      const assetId = String(p.logo ?? "");
      if (assetId) {
        const shapes = await loadAssetShapes(assetId);
        if (shapes.length) {
          const logoSpec = spec.params.logo;
          const areaFraction =
            logoSpec?.kind === "asset" ? logoSpec.areaFraction : 0.45;
          const target = Math.min(width * areaFraction, logoSpan);
          const geoms = fitGroup(
            shapes.map((s) => extrude(s, depth)),
            target,
          );
          for (const g of geoms) {
            g.translate(0, (logoTop + logoBottom) / 2, zBase);
            parts.push(g);
          }
        }
      }
      if (hasText) {
        let text = await textGeometry(String(p.text), String(p.font), textH, depth);
        if (text) {
          text = fitText(text, width * 0.8, textH);
          text.translate(0, faceBottom + textH / 2, zBase);
          parts.push(text);
        }
      }
      if (!parts.length) {
        return { base: displayMerge([body]), overlay: null, overlayMode: null };
      }
      // Cut-through and deboss both subtract; only emboss adds.
      return applyRelief(body, parts, mode === "emboss" ? "emboss" : "deboss");
    }

    case "coaster-set": {
      const size = Number(p.sizeMm);
      const thick = Number(p.thicknessMm);
      const mode = String(p.mode);
      const recessDepth = 0.8;
      const wall = 4;

      const outline = (s: number): THREE.Shape => {
        if (p.shape === "rounded-square") return roundedRectShape(s, s, s * 0.16);
        const c = new THREE.Shape();
        c.absarc(0, 0, s / 2, 0, Math.PI * 2, false);
        return c;
      };

      // Body with the condensation recess sunk into the top face.
      const body = extrude(outline(size), thick);
      const recess = extrude(outline(size - wall * 2), recessDepth + 1);
      recess.translate(0, 0, thick - recessDepth);
      const dished = (await booleanMany(body, [recess], "subtract")) ?? body;

      const floorZ = thick - recessDepth;
      const artArea = (size - wall * 2) * 0.55;
      // Emboss is capped at the recess depth so the set still stacks.
      const artDepth = mode === "emboss" ? recessDepth : relief;

      const assetId = String(p.logo ?? "");
      let artGeoms: THREE.BufferGeometry[] = [];
      if (assetId) {
        const shapes = await loadAssetShapes(assetId);
        if (shapes.length) {
          artGeoms = fitGroup(shapes.map((s) => extrude(s, artDepth)), artArea);
        }
      }
      if (!artGeoms.length) {
        const shapes = await loadIconShapes(String(p.icon));
        if (shapes.length) {
          artGeoms = fitGroup(shapes.map((s) => extrude(s, artDepth)), artArea);
        }
      }
      if (!artGeoms.length) {
        return { base: displayMerge([dished]), overlay: null, overlayMode: null };
      }
      for (const g of artGeoms) {
        g.translate(0, 0, mode === "emboss" ? floorZ : floorZ - relief);
      }
      return applyRelief(dished, artGeoms, mode);
    }

    case "qr-stand": {
      const faceMm = Number(p.faceMm);
      const url = String(p.url ?? "");
      // Cosmetic only: the server regenerates, re-checks the module size and
      // decode-tests the result. A preview that can't encode just shows the
      // blank stand rather than blocking the user mid-type.
      let matrix: boolean[][] | null = null;
      try {
        const QR = (await import("qrcode")).default;
        const normalised = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        const created = QR.create(normalised, { errorCorrectionLevel: "M" });
        const size = created.modules.size;
        const data = created.modules.data;
        // The worker's matrix includes a 4-module quiet zone; mirror that so
        // the preview's module pitch matches the real part.
        const quiet = 4;
        const full = size + quiet * 2;
        matrix = Array.from({ length: full }, (_, r) =>
          Array.from({ length: full }, (_, c) => {
            const sr = r - quiet, sc = c - quiet;
            if (sr < 0 || sc < 0 || sr >= size || sc >= size) return false;
            return Boolean(data[sr * size + sc]);
          }),
        );
      } catch {
        matrix = null;
      }

      const footMm = 14;
      const captionText = String(p.text ?? "").trim();
      const captionH = captionText ? spec.constraints.minTextHeightMm : 0;
      const plateW = faceMm;
      const plateH = footMm + faceMm + (captionText ? captionH + 8 : 0);
      const plateT = 4;
      const baseH = 8;
      const moduleH = 1.2;

      const plate = extrude(roundedRectShape(plateW, plateH, 3), plateT);
      const parts: THREE.BufferGeometry[] = [];

      if (matrix) {
        const n = matrix.length;
        const modMm = faceMm / n;
        const qrCentreY = plateH / 2 - faceMm / 2;
        for (let r = 0; r < n; r++) {
          let c = 0;
          while (c < n) {
            if (!matrix[r][c]) { c++; continue; }
            const start = c;
            while (c < n && matrix[r][c]) c++;
            const run = c - start;
            const box = new THREE.BoxGeometry(run * modMm, modMm, moduleH);
            box.translate(
              -faceMm / 2 + (start + run / 2) * modMm,
              qrCentreY + faceMm / 2 - (r + 0.5) * modMm,
              plateT + moduleH / 2,
            );
            parts.push(box);
          }
        }
      }

      if (captionText) {
        let caption = await textGeometry(
          captionText, String(p.font), captionH, moduleH,
        );
        if (caption) {
          caption = fitText(caption, plateW * 0.86, captionH);
          caption.translate(0, -plateH / 2 + footMm + 4 + captionH / 2, plateT);
          parts.push(caption);
        }
      }

      // Lean the panel back and seat it in the plinth.
      const panel = displayMerge([plate, ...parts]);
      const tilt = THREE.MathUtils.degToRad(90 - 70);
      panel.rotateX(Math.PI / 2 - tilt);
      panel.computeBoundingBox();
      panel.translate(0, 0, -panel.boundingBox!.min.z + baseH - 4.8);

      const baseDepth = Math.max(faceMm * 0.55, 30);
      const base = extrude(roundedRectShape(plateW, baseDepth, 4), baseH);
      base.translate(0, -baseDepth / 2 + plateH * 0.12, 0);

      return {
        base: displayMerge([base, panel]),
        overlay: null,
        overlayMode: null,
      };
    }

    case "bangle": {
      const rIn = Number(p.innerDiameterMm) / 2;
      const wall = Number(p.wallMm);
      const width = Number(p.widthMm);
      const rOut = rIn + wall;
      const ringShape = new THREE.Shape();
      ringShape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
      const bore = new THREE.Path();
      bore.absarc(0, 0, rIn, 0, Math.PI * 2, true);
      ringShape.holes.push(bore);
      const band = new THREE.ExtrudeGeometry(ringShape, {
        depth: width,
        bevelEnabled: false,
        curveSegments: 64,
      });

      let bent: THREE.BufferGeometry | null = null;
      if (String(p.text).trim().length > 0) {
        const embed = 0.8;
        const rBase = p.mode === "deboss" ? rOut - relief : rOut - embed;
        const cap = Math.max(4, Math.min(10, width - 4));
        let text = await textGeometry(String(p.text), String(p.font), cap, relief + embed);
        if (text) {
          text = fitText(text, 4.2 * rBase, width - 2);
          // Cylindrical wrap (mirrors the worker): x -> angle, extrude depth
          // -> radial offset, y -> band axis.
          const flat = text.index ? text.toNonIndexed() : text;
          const pos = flat.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            const theta = x / rBase;
            const radius = rBase + z;
            pos.setXYZ(i, radius * Math.sin(theta), -radius * Math.cos(theta), y + width / 2);
          }
          flat.deleteAttribute("normal");
          flat.deleteAttribute("uv");
          flat.computeVertexNormals();
          bent = flat;
        }
      }
      return applyRelief(band, bent, String(p.mode));
    }

    default:
      throw new Error(`no preview builder for template ${spec.id}`);
  }
}
