import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordJobEvent } from "@/lib/jobs";
import { notifyCompletionPhotoUploaded } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  imageUrl: z.string().regex(/^\/api\/uploads\/image\/[a-z0-9.]+$/i),
  imageMime: z.string().max(40).optional().nullable(),
});

/**
 * Maker attaches a completion photo to the job. The image itself is
 * uploaded via /api/uploads/image first; this endpoint just records the
 * URL on the Job. Allowed any time after ASSIGNED until pickup is verified
 * — re-uploads overwrite the previous one (e.g. if the first shot was bad).
 *
 * Only the assigned maker can call this. The status route uses the
 * resulting `completionPhotoUrl` as the gate that lets them transition to
 * READY_FOR_PICKUP.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile)
    return NextResponse.json({ error: "no maker profile" }, { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      creator: { select: { name: true, email: true } },
    },
  });
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  if (job.assignedMakerId !== profile.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!job.requireCompletionPhoto)
    return NextResponse.json(
      { error: "this job does not require a completion photo" },
      { status: 400 },
    );
  if (!["ASSIGNED", "IN_PROGRESS", "READY_FOR_PICKUP"].includes(job.status))
    return NextResponse.json(
      { error: `cannot attach photo to job in status ${job.status}` },
      { status: 400 },
    );

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });

  await prisma.job.update({
    where: { id },
    data: {
      completionPhotoUrl: parsed.data.imageUrl,
      completionPhotoUploadedAt: new Date(),
    },
  });

  await recordJobEvent({
    jobId: id,
    actor: "maker",
    actorId: session.user.id,
    kind: "log",
    body: "Completion photo uploaded.",
    data: { imageUrl: parsed.data.imageUrl, imageMime: parsed.data.imageMime ?? null },
  });

  notifyCompletionPhotoUploaded({
    creatorEmail: job.creator.email,
    creatorName: job.creator.name ?? "there",
    jobId: id,
    fileName: job.fileName,
    makerName: profile.displayName,
  });

  return NextResponse.json({
    ok: true,
    imageUrl: parsed.data.imageUrl,
    uploadedAt: new Date().toISOString(),
  });
}
