"use client";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Lazy Manifold WASM wrapper for cosmetic client-side booleans.
 * The server regeneration is authoritative; if WASM fails to load or a
 * boolean fails, callers fall back to non-boolean approximations.
 */
type ManifoldModule = typeof import("manifold-3d") extends {
  default: (...args: never[]) => Promise<infer M>;
}
  ? M
  : never;

let modPromise: Promise<ManifoldModule | null> | null = null;

export function loadManifold(): Promise<ManifoldModule | null> {
  if (!modPromise) {
    modPromise = import("manifold-3d")
      .then(async (m) => {
        const wasm = await m.default();
        wasm.setup();
        return wasm;
      })
      .catch((e) => {
        console.warn("Manifold WASM failed to load; preview booleans disabled", e);
        return null;
      });
  }
  return modPromise;
}

function toManifoldMesh(wasm: ManifoldModule, geometry: THREE.BufferGeometry) {
  // Weld on position only — normals/uvs would keep seam vertices distinct
  // and the mesh would not be manifold.
  const posOnly = new THREE.BufferGeometry();
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  posOnly.setAttribute("position", src.attributes.position.clone());
  const geo = mergeVertices(posOnly, 1e-4);
  const pos = geo.attributes.position.array as Float32Array;
  const idx = geo.index!.array;
  return new wasm.Mesh({
    numProp: 3,
    vertProperties: Float32Array.from(pos),
    triVerts: Uint32Array.from(idx),
  });
}

function toGeometry(mesh: { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(mesh.vertProperties.slice(), 3),
  );
  geo.setIndex(new THREE.BufferAttribute(mesh.triVerts.slice(), 1));
  // Flat shading: indexed output would average normals across sharp print
  // edges and make relief read as grooves.
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

export async function booleanOp(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
  op: "union" | "subtract",
): Promise<THREE.BufferGeometry | null> {
  return booleanMany(a, [b], op);
}

/**
 * Union `parts` together (they may overlap each other), then apply `op`
 * against `target`. Overlapping shells inside one BufferGeometry are invalid
 * manifold input, so parts must arrive as separate geometries.
 */
export async function booleanMany(
  target: THREE.BufferGeometry,
  parts: THREE.BufferGeometry[],
  op: "union" | "subtract",
): Promise<THREE.BufferGeometry | null> {
  const wasm = await loadManifold();
  if (!wasm) return null;
  try {
    let combined = new wasm.Manifold(toManifoldMesh(wasm, parts[0]));
    for (const part of parts.slice(1)) {
      const m = new wasm.Manifold(toManifoldMesh(wasm, part));
      const next = combined.add(m);
      combined.delete();
      m.delete();
      combined = next;
    }
    const mt = new wasm.Manifold(toManifoldMesh(wasm, target));
    const result = op === "union" ? mt.add(combined) : mt.subtract(combined);
    const out = toGeometry(result.getMesh());
    mt.delete();
    combined.delete();
    result.delete();
    return out;
  } catch (e) {
    console.warn("preview boolean failed; falling back to overlay", e);
    return null;
  }
}
