import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

// ─────────────────────────────────────────────────────────────────────
// Storage abstraction (Phase 1 of the GCS migration).
//
// The shape below is what the route handlers will eventually call. A
// `local-fs` implementation is wired up today and matches the existing
// behaviour bit-for-bit; a `gcs` implementation will land alongside it
// in a follow-up PR (tested on the staging site before flipping prod).
//
// Existing route handlers still call uploadsDir()/imageUploadsDir()
// directly — nothing about today's traffic flows through this layer
// yet. The migration is per-route and reversible (each route can swap
// from the old API to getStorage() independently).
// ─────────────────────────────────────────────────────────────────────

/** Logical bucket inside the storage backend. Mirrors the on-disk
 *  layout (uploads/ vs uploads/images) so the local-fs impl is a 1:1
 *  swap and the gcs impl can use the same key prefixes. */
export type StorageBucket = "mesh" | "image";

export type SignedUploadUrl = {
  /** PUT this URL with the file as the body. Browser only — never
   *  proxied through our server. */
  url: string;
  /** Stable object key the client sends back to /finalize. */
  key: string;
  /** When the URL expires (ISO). */
  expiresAt: string;
};

export type StoredObjectMeta = {
  key: string;
  sizeBytes: number;
  contentType: string | null;
};

export interface Storage {
  /** Stream-write an object. Used by server-side ingestion paths
   *  (current /api/uploads/route.ts wraps writeFile; future GCS impl
   *  will use the resumable upload API). */
  put(bucket: StorageBucket, key: string, bytes: Uint8Array): Promise<void>;

  /** Read an entire object into memory. Use only for small objects
   *  (chat images, signed thumbnails). For mesh files, prefer
   *  getReadUrl(). */
  read(bucket: StorageBucket, key: string): Promise<Uint8Array>;

  /** Returns metadata without reading the object body. Throws if the
   *  object doesn't exist. */
  head(bucket: StorageBucket, key: string): Promise<StoredObjectMeta>;

  /** Mints a short-lived signed read URL the browser can fetch from
   *  directly. Local-fs returns a passthrough URL served by our app;
   *  gcs returns a v4 signed URL. */
  getReadUrl(bucket: StorageBucket, key: string, ttlSeconds?: number): Promise<string>;

  /** Mints a short-lived signed PUT URL the browser uploads to
   *  directly. Local-fs returns a passthrough URL pointing at our own
   *  finalize endpoint (so dev can still test without a GCS bucket);
   *  gcs returns a v4 signed URL. */
  getUploadUrl(bucket: StorageBucket, key: string, ttlSeconds?: number): Promise<SignedUploadUrl>;
}

/**
 * Local-filesystem implementation. Identical behaviour to the existing
 * uploadsDir()/imageUploadsDir() paths — the route handlers can migrate
 * to this without any visible change.
 */
class LocalFsStorage implements Storage {
  private bucketDir(bucket: StorageBucket): string {
    return bucket === "image" ? imageUploadsDir() : uploadsDir();
  }

  async put(bucket: StorageBucket, key: string, bytes: Uint8Array): Promise<void> {
    const dir = this.bucketDir(bucket);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, key), Buffer.from(bytes));
  }

  async read(bucket: StorageBucket, key: string): Promise<Uint8Array> {
    const buf = await readFile(join(this.bucketDir(bucket), key));
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  async head(bucket: StorageBucket, key: string): Promise<StoredObjectMeta> {
    const s = await stat(join(this.bucketDir(bucket), key));
    return { key, sizeBytes: s.size, contentType: null };
  }

  async getReadUrl(bucket: StorageBucket, key: string): Promise<string> {
    // No real signing in local-fs mode — we serve the file from our own
    // /api/uploads/[name] route which already enforces auth + job
    // membership. Return a path the existing route handles.
    return bucket === "image" ? `/api/uploads/image/${key}` : `/api/uploads/${key}`;
  }

  async getUploadUrl(
    bucket: StorageBucket,
    key: string,
  ): Promise<SignedUploadUrl> {
    // Local-fs has no out-of-process upload target. The "browser PUTs
    // directly" pattern is GCS-only; in dev we just return a URL
    // pointing at the multipart upload route, and the client falls
    // back to the existing flow.
    const url = bucket === "image" ? `/api/uploads/image` : `/api/uploads`;
    return {
      url,
      key,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  }
}

let _storage: Storage | null = null;

/**
 * Resolves the storage backend for the current environment. The choice
 * is made by env var so a single Cloud Run revision can flip between
 * backends without a code change:
 *   - GCS_UPLOADS_BUCKET unset → local filesystem (dev + current prod).
 *   - GCS_UPLOADS_BUCKET=<name> → Google Cloud Storage (Phase 2; not
 *     yet implemented — the import lives in a follow-up PR so today's
 *     bundle has no @google-cloud/storage dependency).
 */
export function getStorage(): Storage {
  if (_storage) return _storage;
  if (process.env.GCS_UPLOADS_BUCKET) {
    // Intentional: the GCS backend lands in a follow-up PR alongside
    // the route migrations, so prod can't accidentally pick it up by
    // setting the env var on the wrong revision. If you're seeing this
    // in a deployed environment, the env var was set ahead of the code.
    throw new Error(
      "GCS_UPLOADS_BUCKET is set but the GCS backend hasn't shipped yet. Unset it or wait for the storage-migration PR.",
    );
  }
  _storage = new LocalFsStorage();
  return _storage;
}
