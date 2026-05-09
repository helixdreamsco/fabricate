import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { uploadsDir } from "@/lib/storage";
import {
  assertSize,
  assertMagicBytes,
  getExtension,
  validateStlGeometry,
  UploadValidationError,
} from "@/lib/upload-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST a single file (multipart/form-data, field "file"). Returns
 * { fileUrl, fileName, fileSizeBytes, warnings? } that the job-creation
 * route stores. Validates: size, extension whitelist, magic-byte sniff,
 * STL manifold check.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Surface a useful message when formData() throws. This is almost
  // always one of:
  //   - body truncated by the proxy body-size cap (see next.config.ts
  //     experimental.proxyClientMaxBodySize). Symptom: very large file.
  //   - request really did arrive without a multipart body (rare; usually
  //     a misconfigured proxy in front of us).
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const contentType = req.headers.get("content-type") ?? "(none)";
    const contentLength = req.headers.get("content-length") ?? "(unknown)";
    console.error("[uploads] formData() failed", {
      contentType,
      contentLength,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          "Upload failed reading the file body. If the file is very large, try a smaller export — server max is 50 MB.",
      },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "missing 'file'" }, { status: 400 });

  let ext: ReturnType<typeof getExtension>;
  try {
    assertSize(file.size);
    ext = getExtension(file.name);
  } catch (err) {
    if (err instanceof UploadValidationError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const bytes = new Uint8Array(buf);

  const warnings: string[] = [];
  try {
    assertMagicBytes(bytes, ext);
    if (ext === "stl") {
      const meta = validateStlGeometry(bytes);
      // Largest registered build volume across PrinterSpecs in the catalogue.
      const MAX_BV_MM = 360;
      const fits =
        meta.dimsMm.x <= MAX_BV_MM &&
        meta.dimsMm.y <= MAX_BV_MM &&
        meta.dimsMm.z <= MAX_BV_MM;
      if (!fits) {
        warnings.push(
          `Mesh dimensions (${meta.dimsMm.x}×${meta.dimsMm.y}×${meta.dimsMm.z} mm) exceed the largest registered build volume (${MAX_BV_MM} mm). Won't fit any maker's printer.`,
        );
      }
    }
  } catch (err) {
    if (err instanceof UploadValidationError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const safeName = `${randomBytes(12).toString("hex")}.${ext}`;
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, safeName), buf);

  return NextResponse.json({
    fileUrl: `/api/uploads/${safeName}`,
    fileName: file.name,
    fileSizeBytes: buf.length,
    warnings,
  });
}
