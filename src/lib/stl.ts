"use client";
import * as THREE from "three";
import {
  STLLoader,
  ThreeMFLoader,
  OBJLoader,
} from "three-stdlib";

/**
 * One body inside a mesh file. STL/OBJ files always produce a single part.
 * 3MF files can carry many — each with its own original material colour.
 */
export type MeshPart = {
  index: number;
  name: string;
  geometry: THREE.BufferGeometry;
  triangleCount: number;
  volumeCm3: number;
  /** Hex colour from the source file's material, when present. */
  originalColorHex: string | null;
};

export type MeshAnalysis = {
  parts: MeshPart[];
  triangleCount: number;
  dimsMm: { x: number; y: number; z: number };
  volumeCm3: number;
  fileName: string;
  fileSize: number;
  format: "stl" | "3mf" | "obj" | "step";
  isMultiMaterial: boolean;
};

const stlLoader = new STLLoader();
const tmfLoader = new ThreeMFLoader();
const objLoader = new OBJLoader();

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _cross = new THREE.Vector3();

function computeVolumeMm3(geometry: THREE.BufferGeometry): number {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  if (!position) return 0;
  let v = 0;
  for (let i = 0; i < position.count; i += 3) {
    _a.fromBufferAttribute(position, i);
    _b.fromBufferAttribute(position, i + 1);
    _c.fromBufferAttribute(position, i + 2);
    _cross.crossVectors(_b, _c);
    v += _a.dot(_cross) / 6;
  }
  return Math.abs(v);
}

function extractColor(material: unknown): string | null {
  if (!material) return null;
  const mat = (Array.isArray(material) ? material[0] : material) as
    | THREE.MeshStandardMaterial
    | THREE.MeshBasicMaterial
    | undefined;
  if (mat?.color && typeof mat.color.getHexString === "function") {
    return "#" + mat.color.getHexString();
  }
  return null;
}

function bakeMeshToPart(
  mesh: THREE.Mesh,
  index: number,
  defaultName: string,
): MeshPart | null {
  const src = mesh.geometry as THREE.BufferGeometry | undefined;
  const positionAttr = src?.attributes.position as
    | THREE.BufferAttribute
    | undefined;
  if (!src || !positionAttr || positionAttr.count === 0) return null;

  let piece = new THREE.BufferGeometry();
  piece.setAttribute("position", positionAttr.clone());
  if (src.index) piece.setIndex(src.index.clone());
  piece.applyMatrix4(mesh.matrixWorld);
  if (piece.index) piece = piece.toNonIndexed();
  if (piece.attributes.position.count === 0) return null;

  piece.computeBoundingBox();
  piece.computeBoundingSphere();
  piece.computeVertexNormals();

  const triangleCount = Math.floor(piece.attributes.position.count / 3);
  const volumeMm3 = computeVolumeMm3(piece);

  return {
    index,
    name: mesh.name?.trim() || defaultName,
    geometry: piece,
    triangleCount,
    volumeCm3: volumeMm3 / 1000,
    originalColorHex: extractColor(mesh.material),
  };
}

function partsFromGroup(group: THREE.Object3D): MeshPart[] {
  const parts: MeshPart[] = [];
  group.updateMatrixWorld(true);
  let idx = 0;
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const part = bakeMeshToPart(mesh, idx, `Part ${idx + 1}`);
    if (part) {
      parts.push(part);
      idx += 1;
    }
  });
  return parts;
}

async function loadParts(
  file: File,
): Promise<{ parts: MeshPart[]; format: MeshAnalysis["format"] }> {
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  const buffer = await file.arrayBuffer();

  if (ext === ".stl") {
    const geom = stlLoader.parse(buffer);
    geom.computeBoundingBox();
    geom.computeVertexNormals();
    const triangleCount = Math.floor(
      (geom.attributes.position as THREE.BufferAttribute).count / 3,
    );
    return {
      format: "stl",
      parts: [
        {
          index: 0,
          name: "Body",
          geometry: geom,
          triangleCount,
          volumeCm3: computeVolumeMm3(geom) / 1000,
          originalColorHex: null,
        },
      ],
    };
  }

  if (ext === ".3mf") {
    const group = tmfLoader.parse(buffer);
    const parts = partsFromGroup(group);
    if (parts.length === 0)
      throw new Error("3MF file contained no mesh geometry");
    return { format: "3mf", parts };
  }

  if (ext === ".obj") {
    const text = new TextDecoder().decode(buffer);
    const group = objLoader.parse(text);
    const parts = partsFromGroup(group);
    if (parts.length === 0)
      throw new Error("OBJ file contained no mesh geometry");
    return { format: "obj", parts };
  }

  if (ext === ".step" || ext === ".stp") {
    // STEP is a parametric B-rep format — three.js can't tessellate it in
    // the browser (would need OpenCASCADE WASM / occt-import-js, ~10 MB).
    // We accept the upload, surface a placeholder cube so the rest of the
    // configure UI doesn't crash, and route the file to the maker as-is —
    // their slicer (Bambu Studio, PrusaSlicer, Cura) handles STEP natively.
    const placeholder = new THREE.BoxGeometry(40, 40, 40);
    placeholder.computeBoundingBox();
    placeholder.computeVertexNormals();
    return {
      format: "step",
      parts: [
        {
          index: 0,
          name: "STEP",
          geometry: placeholder,
          triangleCount: 0,
          volumeCm3: 0,
          originalColorHex: null,
        },
      ],
    };
  }

  throw new Error(`Unsupported mesh format: ${ext}`);
}

export async function analyzeSTL(file: File): Promise<MeshAnalysis> {
  const { parts, format } = await loadParts(file);

  // 3MF files often come from CAD apps that use Z-up. STL/OBJ are usually
  // already Y-up. Apply a one-time rotation per part for consistency.
  if (format === "3mf") {
    const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    for (const p of parts) {
      p.geometry.applyMatrix4(rot);
      p.geometry.computeBoundingBox();
      p.geometry.computeVertexNormals();
    }
  }

  const overallBbox = new THREE.Box3();
  let totalVolumeCm3 = 0;
  let totalTriangles = 0;
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    if (p.geometry.boundingBox) overallBbox.union(p.geometry.boundingBox);
    totalVolumeCm3 += p.volumeCm3;
    totalTriangles += p.triangleCount;
  }
  if (!isFinite(overallBbox.min.x)) {
    throw new Error("Mesh has no valid bounding box — file may be empty");
  }

  return {
    parts,
    triangleCount: totalTriangles,
    dimsMm: {
      x: overallBbox.max.x - overallBbox.min.x,
      y: overallBbox.max.y - overallBbox.min.y,
      z: overallBbox.max.z - overallBbox.min.z,
    },
    volumeCm3: totalVolumeCm3,
    fileName: file.name,
    fileSize: file.size,
    format,
    isMultiMaterial: parts.length > 1,
  };
}
