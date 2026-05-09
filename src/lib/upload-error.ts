/**
 * User-facing message for a failed upload. Centralised here so the
 * homepage dropzone, landing hero, and /configure page all surface the
 * same wording when a file is rejected.
 *
 * The accept filter is intentionally loose on the client (iOS Safari greys
 * out CAD types when one is set), so the rejection happens after pick.
 * That makes a clear, file-name-specific message important.
 */

import { MAX_UPLOAD_BYTES } from "./upload-validation";

const SUPPORTED = ["stl", "3mf", "obj", "step", "stp"] as const;

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function getExt(filename: string): string | null {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : null;
}

/**
 * Returns a friendly rejection string, or null if the file's extension is
 * one we accept (in which case the caller should attempt to parse and let
 * any thrown error supply the message).
 */
export function preflightUploadError(file: File): string | null {
  const ext = getExt(file.name);
  if (!ext) {
    return `That file has no extension. Save it as .stl, .3mf, .obj or .step and try again.`;
  }
  if (!SUPPORTED.includes(ext as (typeof SUPPORTED)[number])) {
    return `Can't print a .${ext} file. Supported formats: STL, 3MF, OBJ, STEP.`;
  }
  if (file.size === 0) {
    return `That file is empty (0 bytes). Try re-exporting it.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${humanSize(file.size)} — too large to upload. Max is ${humanSize(MAX_UPLOAD_BYTES)}. Try a lower-resolution export (decimate / fewer triangles).`;
  }
  return null;
}

/**
 * Convert any thrown error from analyzeSTL / postAnalyze into a sentence
 * the user can act on. Falls back to a generic line when the error is
 * opaque (e.g. a Three.js parse failure with no message).
 */
export function describeUploadError(file: File, err: unknown): string {
  const pre = preflightUploadError(file);
  if (pre) return pre;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/no mesh geometry|no valid bounding box|empty/i.test(msg)) {
    return "That file looks empty — no mesh geometry inside. Try re-exporting it.";
  }
  if (/Unsupported mesh format/i.test(msg)) {
    return "That format isn't supported yet. Try STL, 3MF, OBJ or STEP.";
  }
  if (/STL/i.test(msg)) {
    return "Could not parse that STL. Make sure it's a valid binary or ASCII STL.";
  }
  return "Could not read that file. Try re-exporting it from your CAD app.";
}
