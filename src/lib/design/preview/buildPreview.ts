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

    case "badge-round": {
      const d = Number(p.diameterMm), thick = Number(p.thicknessMm);
      const disc = new THREE.CylinderGeometry(d / 2, d / 2, thick, 64);
      disc.rotateX(Math.PI / 2);
      disc.translate(0, 0, thick / 2);
      const tab = extrude(
        (() => {
          const s = new THREE.Shape();
          s.absarc(0, 0, 4.5, 0, Math.PI * 2, false);
          const hole = new THREE.Path();
          hole.absarc(0, 0, 2, 0, Math.PI * 2, true);
          s.holes.push(hole);
          return s;
        })(),
        thick,
      );
      tab.translate(0, d / 2 + 2.5, 0);

      const hasText = String(p.text).trim().length > 0;
      const shapes = await loadIconShapes(String(p.icon));
      const iconSize = d * (hasText ? 0.36 : 0.45);
      // Extrude each polygon separately — overlapping polygons must be
      // unioned via Manifold, not merged into one multi-shell mesh.
      const polys = shapes.map((s) => extrude(s, relief));
      const groupBox = new THREE.Box3();
      for (const g of polys) {
        g.computeBoundingBox();
        groupBox.union(g.boundingBox!);
      }
      const iw = groupBox.max.x - groupBox.min.x;
      const ih = groupBox.max.y - groupBox.min.y;
      const s = iconSize / Math.max(iw, ih);
      const cx = ((groupBox.min.x + groupBox.max.x) / 2) * s;
      const cy = ((groupBox.min.y + groupBox.max.y) / 2) * s;
      const zRelief = Number(p.mode === "deboss" ? thick - relief : thick - 0.05);
      const reliefParts: THREE.BufferGeometry[] = [];
      for (const g of polys) {
        g.scale(s, s, 1);
        g.translate(-cx, -cy + (hasText ? d * 0.12 : 0), zRelief);
        reliefParts.push(g);
      }
      if (hasText) {
        let text = await textGeometry(String(p.text), String(p.font), d * 0.14, relief);
        if (text) {
          text = fitText(text, d * 0.7, d * 0.2);
          text.translate(0, -d * 0.28, zRelief);
          reliefParts.push(text);
        }
      }
      return applyRelief(disc, reliefParts, String(p.mode), [tab]);
    }

    case "nameplate-desk": {
      const width = Number(p.widthMm);
      const depth = 32, height = 38;
      const tri = new THREE.Shape();
      tri.moveTo(0, 0);
      tri.lineTo(depth, 0);
      tri.lineTo(0, height);
      tri.closePath();
      const wedge = extrude(tri, width);
      wedge.rotateY(Math.PI / 2);
      wedge.rotateZ(Math.PI / 2);
      wedge.translate(-width / 2, depth / 2, 0);
      // Sloped front face: from (y=-depth/2? ) — approximate: place text on the
      // slope plane facing the viewer.
      let text = await textGeometry(String(p.text), String(p.font), 14, relief);
      let result: PreviewResult;
      if (text) {
        text = fitText(text, width - 16, height * 0.5);
        const angle = Math.atan2(height, depth);
        text.rotateX(Math.PI / 2 - angle);
        const midZ = height / 2.4;
        const midY = depth / 2 - (midZ / height) * depth;
        text.translate(0, midY + (relief * Math.sin(angle)) * (p.mode === "deboss" ? -1 : 1) * 0.5, midZ);
        result = await applyRelief(wedge, text, String(p.mode));
      } else {
        result = { base: wedge, overlay: null, overlayMode: null };
      }
      return result;
    }

    case "cake-topper": {
      const width = Number(p.widthMm);
      let text = await textGeometry(String(p.text), String(p.font), 30, 3);
      const bar = new THREE.BoxGeometry(width, 3, 8);
      bar.translate(0, 1.5, 4);
      const spike = (x: number) => {
        const g = new THREE.CylinderGeometry(2.5, 0.8, 45, 12);
        g.rotateX(Math.PI / 2);
        g.translate(x, 1.5, -22.5);
        return g;
      };
      const parts: THREE.BufferGeometry[] = [bar, spike(-width * 0.3), spike(width * 0.3)];
      if (text) {
        text = fitText(text, width - 6, 70);
        text.computeBoundingBox();
        const tb = text.boundingBox!;
        // stand text upright in XZ plane, sitting on the bar
        text.rotateX(Math.PI / 2);
        text.translate(0, 3, 8 - tb.min.y);
        parts.push(text);
      }
      return { base: displayMerge(parts), overlay: null, overlayMode: null };
    }

    case "figure-modular": {
      const height = Number(p.heightMm);
      const u = height / 100; // template authored at 100mm, scaled
      const parts: THREE.BufferGeometry[] = [];
      const baseDisc = new THREE.CylinderGeometry(30 * u, 32 * u, 8 * u, 48);
      baseDisc.rotateX(Math.PI / 2);
      baseDisc.translate(0, 0, 4 * u);

      const bodyH = 48 * u, bodyR = 16 * u, bodyZ = 8 * u;
      if (p.body === "capsule") {
        const g = new THREE.CapsuleGeometry(bodyR, bodyH - 2 * bodyR, 8, 24);
        g.rotateX(Math.PI / 2);
        g.translate(0, 0, bodyZ + bodyH / 2);
        parts.push(g);
      } else if (p.body === "box") {
        const g = new THREE.BoxGeometry(bodyR * 2, bodyR * 2, bodyH);
        g.translate(0, 0, bodyZ + bodyH / 2);
        parts.push(g);
      } else {
        const g = new THREE.SphereGeometry(bodyH / 2, 32, 24);
        g.scale(0.85, 0.85, 1);
        g.translate(0, 0, bodyZ + bodyH / 2);
        parts.push(g);
      }

      const headR = 13 * u, headZ = bodyZ + bodyH + headR - 2 * u;
      if (p.head === "sphere" || p.head === "cat") {
        const g = new THREE.SphereGeometry(headR, 32, 24);
        g.translate(0, 0, headZ);
        parts.push(g);
        if (p.head === "cat") {
          for (const side of [-1, 1]) {
            const ear = new THREE.ConeGeometry(5 * u, 9 * u, 16);
            ear.rotateX(Math.PI / 2);
            ear.translate(side * headR * 0.62, 0, headZ + headR * 0.85);
            parts.push(ear);
          }
        }
      } else {
        const g = new THREE.BoxGeometry(headR * 1.8, headR * 1.8, headR * 1.8);
        g.translate(0, 0, headZ);
        parts.push(g);
      }

      const accZ = headZ + headR;
      if (p.accessory === "hat") {
        const g = new THREE.ConeGeometry(headR * 0.9, 16 * u, 24);
        g.rotateX(Math.PI / 2);
        g.translate(0, 0, accZ + 6 * u);
        parts.push(g);
      } else if (p.accessory === "antenna") {
        const stem = new THREE.CylinderGeometry(1.6 * u, 1.6 * u, 12 * u, 12);
        stem.rotateX(Math.PI / 2);
        stem.translate(0, 0, accZ + 5 * u);
        const ball = new THREE.SphereGeometry(3 * u, 16, 12);
        ball.translate(0, 0, accZ + 12 * u);
        parts.push(stem, ball);
      } else if (p.accessory === "crown") {
        const band = new THREE.CylinderGeometry(headR * 0.75, headR * 0.75, 5 * u, 24);
        band.rotateX(Math.PI / 2);
        band.translate(0, 0, accZ + 1 * u);
        parts.push(band);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const sp = new THREE.ConeGeometry(2.2 * u, 6 * u, 8);
          sp.rotateX(Math.PI / 2);
          sp.translate(Math.cos(a) * headR * 0.75, Math.sin(a) * headR * 0.75, accZ + 5 * u);
          parts.push(sp);
        }
      }

      let text =
        String(p.baseText ?? "").trim().length > 0
          ? await textGeometry(String(p.baseText), String(p.font), 6 * u, spec.constraints.reliefDepthMm)
          : null;
      if (text) {
        text = fitText(text, 44 * u, 7 * u);
        text.rotateX(Math.PI / 2);
        text.translate(0, -31 * u, 1.5 * u);
      }
      // Text booleans onto the base disc only; body/head/accessory parts are
      // merged for display (the server unions everything properly).
      return applyRelief(baseDisc, text, "emboss", parts);
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
