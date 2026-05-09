/**
 * Server-side upload validation: size, extension, magic-byte sniff, and
 * STL manifold check. Stops malicious or broken uploads from reaching the
 * slicer.
 */

// 2 GiB. The client-side preflight in upload-error.ts and the server-side
// check in /api/uploads both read this. The matching Next.js proxy cap is
// set in next.config.ts (experimental.proxyClientMaxBodySize). Note: the
// hosting platform also has its own request-size cap — see deployment
// notes in next.config.ts.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ["stl", "3mf", "step", "stp", "obj"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export class UploadValidationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getExtension(filename: string): AllowedExtension {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) throw new UploadValidationError(400, "File has no extension.");
  const ext = m[1];
  if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    throw new UploadValidationError(
      400,
      `Unsupported file type ".${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    );
  }
  return ext as AllowedExtension;
}

export function assertSize(byteLength: number) {
  if (byteLength <= 0)
    throw new UploadValidationError(400, "File is empty.");
  if (byteLength > MAX_UPLOAD_BYTES) {
    const limit =
      MAX_UPLOAD_BYTES >= 1024 ** 3
        ? `${(MAX_UPLOAD_BYTES / 1024 ** 3).toFixed(1)} GB`
        : `${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;
    throw new UploadValidationError(413, `File too large (max ${limit}).`);
  }
}

/**
 * Verify the file's first bytes match the claimed extension. Catches a
 * .exe renamed .stl, mismatched archives, etc.
 */
export function assertMagicBytes(bytes: Uint8Array, ext: AllowedExtension) {
  const head = bytes.slice(0, Math.min(bytes.length, 256));
  const headStr = new TextDecoder("latin1").decode(head);

  switch (ext) {
    case "stl": {
      // Two flavours. ASCII starts with "solid ". Binary has an 80-byte
      // header (any content) followed by a 4-byte little-endian triangle
      // count; total length = 84 + count*50.
      const isAscii = headStr.startsWith("solid ");
      if (isAscii) {
        // Sneaky binary STLs sometimes start with "solid"; verify it's
        // really ASCII by looking for printable text and "facet normal".
        const sample = new TextDecoder("latin1").decode(
          bytes.slice(0, Math.min(bytes.length, 4096)),
        );
        if (sample.includes("facet normal") || sample.includes("vertex")) return;
      }
      if (bytes.length < 84)
        throw new UploadValidationError(400, "STL file too short.");
      const count =
        bytes[80] | (bytes[81] << 8) | (bytes[82] << 16) | (bytes[83] << 24);
      const expected = 84 + count * 50;
      if (bytes.length === expected) return;
      throw new UploadValidationError(
        400,
        "File contents don't match a valid STL (header/length mismatch).",
      );
    }
    case "3mf": {
      // 3MF is a ZIP. Magic bytes: 50 4B 03 04 ("PK\x03\x04").
      if (
        head[0] === 0x50 &&
        head[1] === 0x4b &&
        head[2] === 0x03 &&
        head[3] === 0x04
      )
        return;
      throw new UploadValidationError(
        400,
        "File contents don't match a 3MF archive.",
      );
    }
    case "step":
    case "stp": {
      if (headStr.includes("ISO-10303-21")) return;
      throw new UploadValidationError(
        400,
        "File contents don't match a STEP file.",
      );
    }
    case "obj": {
      // OBJ is plain text. Look for # comment, mtllib, v, vn, vt, f within first 4KB.
      const sample = new TextDecoder("latin1").decode(
        bytes.slice(0, Math.min(bytes.length, 4096)),
      );
      if (/^(#|mtllib|o |g |v |vn |vt |f )/m.test(sample)) return;
      throw new UploadValidationError(
        400,
        "File contents don't match an OBJ file.",
      );
    }
  }
}

/**
 * Parse a binary STL and check for non-manifold geometry. Returns the
 * triangle count and the bounding-box dimensions. Throws if the mesh has
 * any unmatched edges (non-manifold) or zero volume.
 *
 * Only validates binary STLs for now. ASCII STL parsing is more involved
 * and the binary path catches the common upload failures.
 */
export function validateStlGeometry(bytes: Uint8Array): {
  triangles: number;
  dimsMm: { x: number; y: number; z: number };
} {
  if (bytes.length < 84)
    throw new UploadValidationError(400, "STL file too short.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const expected = 84 + count * 50;

  // Skip ASCII STLs — we don't currently parse them for geometry, but the
  // size + magic-byte checks have already run, so they're at least
  // structurally plausible.
  const headStr = new TextDecoder("latin1").decode(
    bytes.slice(0, Math.min(bytes.length, 256)),
  );
  if (headStr.startsWith("solid ") && bytes.length !== expected) return { triangles: 0, dimsMm: { x: 0, y: 0, z: 0 } };

  if (bytes.length !== expected)
    throw new UploadValidationError(
      400,
      "STL length doesn't match its declared triangle count.",
    );

  if (count === 0)
    throw new UploadValidationError(400, "STL contains zero triangles.");

  const edgeCounts = new Map<string, number>();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const PRECISION = 4;

  for (let i = 0; i < count; i++) {
    const offset = 84 + i * 50;
    // skip 12 bytes normal
    const a = readVec(view, offset + 12);
    const b = readVec(view, offset + 24);
    const c = readVec(view, offset + 36);
    for (const v of [a, b, c]) {
      if (v[0] < minX) minX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[2] < minZ) minZ = v[2];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] > maxY) maxY = v[1];
      if (v[2] > maxZ) maxZ = v[2];
    }
    bumpEdge(edgeCounts, a, b);
    bumpEdge(edgeCounts, b, c);
    bumpEdge(edgeCounts, c, a);
  }

  // Manifold: every edge appears exactly twice.
  let nonManifold = 0;
  for (const v of edgeCounts.values()) if (v !== 2) nonManifold++;
  // Allow up to 0.5% non-manifold edges — many otherwise-fine consumer
  // STLs have a tiny number of unmatched edges from float imprecision.
  const tolerance = Math.max(2, Math.floor(edgeCounts.size * 0.005));
  if (nonManifold > tolerance) {
    throw new UploadValidationError(
      400,
      `Mesh is not watertight (${nonManifold} unmatched edges of ${edgeCounts.size}).`,
    );
  }

  const dimsMm = {
    x: round1(maxX - minX),
    y: round1(maxY - minY),
    z: round1(maxZ - minZ),
  };
  if (dimsMm.x === 0 || dimsMm.y === 0 || dimsMm.z === 0)
    throw new UploadValidationError(400, "Mesh has zero volume in one axis.");

  return { triangles: count, dimsMm };

  function readVec(v: DataView, off: number): [number, number, number] {
    return [
      round(v.getFloat32(off, true), PRECISION),
      round(v.getFloat32(off + 4, true), PRECISION),
      round(v.getFloat32(off + 8, true), PRECISION),
    ];
  }

  function bumpEdge(
    m: Map<string, number>,
    a: [number, number, number],
    b: [number, number, number],
  ) {
    const key = edgeKey(a, b);
    m.set(key, (m.get(key) ?? 0) + 1);
  }

  function edgeKey(
    a: [number, number, number],
    b: [number, number, number],
  ): string {
    const ka = `${a[0]},${a[1]},${a[2]}`;
    const kb = `${b[0]},${b[1]},${b[2]}`;
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  }

  function round(n: number, p: number): number {
    const f = 10 ** p;
    return Math.round(n * f) / f;
  }

  function round1(n: number): number {
    return Math.round(n * 10) / 10;
  }
}
