import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDesignIdentity, ownerWhere } from "@/lib/design/identity";
import { readArtifact } from "@/lib/design/jobs";

/**
 * Per-owner artifact access. The key is `<jobId>/<file>` where jobId may be
 * another job's directory (geometry-cache reuse) — authorisation checks that
 * the requester owns a job whose stored keys include this exact key.
 */
/**
 * A name the file keeps once it's in someone's Downloads folder.
 *
 * Everything used to arrive as `fabricate-design.stl`, so saving a second
 * design gave you `fabricate-design (1).stl` and no way to tell them apart.
 * Template id and date are both things the owner can recognise.
 */
function downloadName(
  job: { templateId: string | null; kind: string; createdAt: Date },
  file: string,
): string {
  const ext = file.split(".").pop();
  const what = job.templateId ?? (job.kind === "ai" ? "ai-design" : "design");
  const day = job.createdAt.toISOString().slice(0, 10);
  // Belt and braces: the value lands in a quoted header.
  const safe = `fabricate-${what}-${day}`.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${safe}.${ext}`;
}

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
    select: { id: true, templateId: true, kind: true, createdAt: true },
  });
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data = await readArtifact(jobId, file);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.endsWith(".glb") ? "model/gltf-binary" : "model/stl",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `attachment; filename="${downloadName(owned, file)}"`,
    },
  });
}
