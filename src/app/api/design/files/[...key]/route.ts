import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDesignIdentity, ownerWhere } from "@/lib/design/identity";
import { readArtifact } from "@/lib/design/jobs";

/**
 * Per-owner artifact access. The key is `<jobId>/<file>` where jobId may be
 * another job's directory (geometry-cache reuse) — authorisation checks that
 * the requester owns a job whose stored keys include this exact key.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  if (key.length !== 2 || key.some((part) => part.includes(".."))) {
    return NextResponse.json({ error: "bad_key" }, { status: 400 });
  }
  const [jobId, file] = key;
  if (file !== "model.stl" && file !== "preview.glb") {
    return NextResponse.json({ error: "bad_key" }, { status: 400 });
  }
  const identity = await getDesignIdentity();
  const joined = `${jobId}/${file}`;
  const owned = await prisma.designJob.findFirst({
    where: {
      ...ownerWhere(identity),
      OR: [{ stlKey: joined }, { glbKey: joined }],
    },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data = await readArtifact(jobId, file);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.endsWith(".glb") ? "model/gltf-binary" : "model/stl",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `attachment; filename="fabricate-design.${file.split(".").pop()}"`,
    },
  });
}
