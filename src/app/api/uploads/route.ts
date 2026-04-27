import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([".stl", ".3mf", ".obj", ".step", ".stp"]);
const MAX_BYTES = 80 * 1024 * 1024; // 80 MB

const UPLOAD_DIR = join(process.cwd(), "prisma", "uploads");

/**
 * POST a single file (multipart/form-data, field "file"). Returns
 * { fileUrl, fileName, fileSizeBytes } that the job-creation route stores.
 *
 * Disk-based for now; swap to S3/R2 before scaling beyond a single instance
 * (the filesystem is ephemeral on most PaaS deploys).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "missing 'file'" }, { status: 400 });

  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "file too large" }, { status: 413 });

  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED.has(ext))
    return NextResponse.json({ error: `unsupported extension '${ext}'` }, { status: 415 });

  const safeName = `${randomBytes(12).toString("hex")}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(UPLOAD_DIR, safeName), buf);

  return NextResponse.json({
    fileUrl: `/api/uploads/${safeName}`,
    fileName: file.name,
    fileSizeBytes: buf.length,
  });
}
