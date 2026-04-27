import { join } from "node:path";

/**
 * Base directory for persistent runtime files (uploaded mesh files, chat
 * images, completion photos).
 *
 * In dev / when `DATA_DIR` is unset, files live under `<cwd>/prisma/`
 * (next to the SQLite db) so a fresh checkout works with no extra setup.
 *
 * On hosted environments we mount a persistent volume at e.g. `/data`
 * and set `DATA_DIR=/data` so the volume isn't overlaid on the code.
 */
export function dataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), "prisma");
}

export function uploadsDir(): string {
  return join(dataDir(), "uploads");
}

export function imageUploadsDir(): string {
  return join(dataDir(), "uploads", "images");
}
