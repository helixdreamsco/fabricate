/**
 * Storage and lifecycle for user-uploaded logo assets.
 *
 * An asset is created once, from bytes we have sanitised, and is then
 * immutable — template parameter JSON references it by id and the geometry
 * cache assumes that id always means the same artwork.
 *
 * Two files are written per asset:
 *   <id>.svg   the sanitised artwork — the only form ever stored or served
 *   <id>.json  extracted polygon rings, so neither the browser preview nor
 *              the Python worker has to re-parse the SVG (see svg/geometry).
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { dataDir } from "@/lib/storage";
import type { DesignAsset } from "@prisma/client";
import { sanitiseSvg, SvgRejected } from "./svg/sanitise";
import { extractGeometry, type LogoGeometry } from "./svg/geometry";
import { moderateLogo } from "./moderation";
import type { DesignIdentity } from "./identity";

export function assetsDir(): string {
  return path.join(dataDir(), "designs", "assets");
}

/** Resolve a storage key, refusing anything that escapes the assets dir. */
function assetPath(file: string): string {
  const dir = path.resolve(assetsDir());
  const p = path.resolve(path.join(dir, file));
  if (p !== dir && !p.startsWith(dir + path.sep)) throw new Error("bad asset key");
  return p;
}

export function newAssetId(): string {
  return `asset_${randomBytes(12).toString("hex")}`;
}

export type CreateAssetResult =
  | { ok: true; asset: DesignAsset; geometry: LogoGeometry; reused: boolean }
  | { ok: false; code: string; message: string };

/**
 * Sanitise → extract → moderate → store. Every step can reject, and a
 * rejection never writes anything.
 *
 * Moderation is fail-closed and mirrors the AI path: a classifier that can't
 * answer blocks the upload rather than waving it through.
 */
export async function createAsset(opts: {
  identity: DesignIdentity & { userId: string };
  bytes: Uint8Array;
  filename: string;
  /** Outline stroke-only artwork instead of rejecting it. */
  autoOutline?: boolean;
}): Promise<CreateAssetResult> {
  let sanitised;
  let geometry: LogoGeometry;
  try {
    sanitised = sanitiseSvg(opts.bytes);
    geometry = extractGeometry(sanitised.svg, {
      allowAutoOutline: opts.autoOutline ?? true,
    });
  } catch (e) {
    if (e instanceof SvgRejected) {
      return { ok: false, code: e.code, message: e.friendly };
    }
    return {
      ok: false,
      code: "malformed",
      message: "We couldn't read that SVG. Try re-exporting it from your design tool.",
    };
  }

  // Dedupe on the sanitised bytes: the same logo uploaded twice must resolve
  // to one id, or the geometry cache would fork for identical artwork.
  const contentHash = createHash("sha256").update(sanitised.svg).digest("hex");
  const existing = await prisma.designAsset.findUnique({
    where: { userId_contentHash: { userId: opts.identity.userId, contentHash } },
  });
  if (existing) {
    if (existing.moderationVerdict === "block") {
      return {
        ok: false,
        code: "moderation",
        message:
          existing.moderationReason ??
          "We can't use that logo. If it's your own brand, get in touch.",
      };
    }
    return { ok: true, asset: existing, geometry, reused: true };
  }

  const moderation = await moderateLogo(opts.identity, sanitised.svg);
  if (!moderation.allowed) {
    return { ok: false, code: "moderation", message: moderation.message };
  }

  const id = newAssetId();
  const svgKey = `${id}.svg`;
  const geometryKey = `${id}.json`;
  await fs.promises.mkdir(assetsDir(), { recursive: true });
  await fs.promises.writeFile(assetPath(svgKey), sanitised.svg, "utf8");
  await fs.promises.writeFile(
    assetPath(geometryKey),
    JSON.stringify(geometry),
    "utf8",
  );

  const [minX, minY, maxX, maxY] = geometry.bounds;
  const asset = await prisma.designAsset.create({
    data: {
      id,
      userId: opts.identity.userId,
      contentHash,
      filename: opts.filename.slice(0, 200),
      svgKey,
      geometryKey,
      widthUnits: maxX - minX,
      heightUnits: maxY - minY,
      shapeCount: sanitised.shapeCount,
      autoOutlined: geometry.autoOutlined,
      moderationVerdict: "allow",
    },
  });
  return { ok: true, asset, geometry, reused: false };
}

/** Fetch an asset the caller owns, or null. Ownership is not optional. */
export async function getOwnedAsset(
  userId: string,
  assetId: string,
): Promise<DesignAsset | null> {
  return prisma.designAsset.findFirst({
    where: { id: assetId, userId, moderationVerdict: "allow" },
  });
}

export async function readAssetSvg(asset: DesignAsset): Promise<string | null> {
  try {
    return await fs.promises.readFile(assetPath(asset.svgKey), "utf8");
  } catch {
    return null;
  }
}

export async function readAssetGeometry(
  asset: DesignAsset,
): Promise<LogoGeometry | null> {
  try {
    const raw = await fs.promises.readFile(assetPath(asset.geometryKey), "utf8");
    return JSON.parse(raw) as LogoGeometry;
  } catch {
    return null;
  }
}

/**
 * Resolve every `asset` parameter on a job into the polygon payload the
 * Python worker needs.
 *
 * The worker is stateless and has no access to our storage, so artwork must
 * travel inline in the request body. Skipping this step would silently
 * rebuild the part with no logo on it — which is exactly the kind of failure
 * that only shows up after someone has paid.
 */
export async function resolveAssetsForWorker(
  userId: string | null,
  params: Record<string, string | number>,
  assetKeys: string[],
): Promise<Record<string, LogoGeometry>> {
  const out: Record<string, LogoGeometry> = {};
  for (const key of assetKeys) {
    const id = params[key];
    if (typeof id !== "string" || id === "") continue;
    if (!userId) throw new Error(`asset ${id} referenced without an owner`);
    const asset = await getOwnedAsset(userId, id);
    if (!asset) throw new Error(`asset ${id} not found for this user`);
    const geometry = await readAssetGeometry(asset);
    if (!geometry) throw new Error(`asset ${id} has no stored geometry`);
    out[id] = geometry;
  }
  return out;
}
