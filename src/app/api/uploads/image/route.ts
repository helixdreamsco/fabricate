import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/uploads/image
 *
 * Accepts a single image (multipart, field "file"). The client should
 * resize/compress before sending — see `resizeImageBlob` in JobChat.tsx
 * which downsamples to 1600px @ 0.85 JPEG. We still cap server-side at
 * 12 MB as a safety net.
 *
 * Stored to disk under prisma/uploads/images/. Served back through
 * /api/uploads/image/[name] with a per-request authz check that the
 * caller is part of a job that references this URL.
 */

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const MAX_BYTES = 12 * 1024 * 1024;

const UPLOAD_DIR = join(process.cwd(), "prisma", "uploads", "images");

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form)
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "missing 'file'" }, { status: 400 });

  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "image too large" }, { status: 413 });

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime))
    return NextResponse.json(
      { error: `unsupported image type: ${mime || "unknown"}` },
      { status: 415 },
    );

  const ext = EXT_BY_MIME[mime] ?? (extname(file.name).toLowerCase() || ".jpg");
  const safeName = `${randomBytes(12).toString("hex")}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(UPLOAD_DIR, safeName), buf);

  return NextResponse.json({
    imageUrl: `/api/uploads/image/${safeName}`,
    imageMime: mime,
    sizeBytes: buf.length,
  });
}
