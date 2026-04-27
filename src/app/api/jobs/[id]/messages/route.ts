import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { emitJobBusEvent, type SerializedJobMessage } from "@/lib/jobs";
import { notifyChatMessage } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  body: z.string().trim().max(2000).default(""),
  imageUrl: z.string().regex(/^\/api\/uploads\/image\/[a-z0-9.]+$/i).optional().nullable(),
  imageMime: z.string().max(40).optional().nullable(),
}).refine(
  (v) => (v.body && v.body.length > 0) || (v.imageUrl && v.imageUrl.length > 0),
  { message: "message must have a body or an image" },
);

async function authorize(jobId: string, userId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { error: "not found", status: 404 as const };
  const isCreator = job.creatorId === userId;
  const profile = await prisma.makerProfile.findUnique({ where: { userId } });
  const isAssignedMaker = profile && job.assignedMakerId === profile.id;
  if (!isCreator && !isAssignedMaker)
    return { error: "forbidden", status: 403 as const };
  return { job, isCreator, isAssignedMaker };
}

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ctx = await authorize(id, session.user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const limit = Math.min(
    Number(new URL(req.url).searchParams.get("limit") ?? "100") || 100,
    200
  );
  const rows = await prisma.jobMessage.findMany({
    where: { jobId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { author: { select: { id: true, name: true, image: true } } },
  });
  const messages: SerializedJobMessage[] = rows
    .map((m) => ({
      id: m.id,
      jobId: m.jobId,
      authorId: m.authorId,
      authorName: m.author.name,
      authorImage: m.author.image,
      body: m.body,
      imageUrl: m.imageUrl,
      imageMime: m.imageMime,
      createdAt: m.createdAt.toISOString(),
    }))
    .reverse();
  return NextResponse.json({ messages });
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ctx = await authorize(id, session.user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const saved = await prisma.jobMessage.create({
    data: {
      jobId: id,
      authorId: session.user.id,
      body: parsed.data.body,
      imageUrl: parsed.data.imageUrl ?? null,
      imageMime: parsed.data.imageMime ?? null,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  });
  const payload: SerializedJobMessage = {
    id: saved.id,
    jobId: saved.jobId,
    authorId: saved.authorId,
    authorName: saved.author.name,
    authorImage: saved.author.image,
    body: saved.body,
    imageUrl: saved.imageUrl,
    imageMime: saved.imageMime,
    createdAt: saved.createdAt.toISOString(),
  };
  emitJobBusEvent(id, { type: "message:new", jobId: id, message: payload });

  // Notify the other party of new chat (debounced — see notifications.ts).
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      assignedMaker: {
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });
  if (job?.assignedMaker) {
    const fromName = saved.author.name ?? saved.author.id;
    if (session.user.id === job.creatorId) {
      // sender is creator → notify maker
      notifyChatMessage({
        recipientEmail: job.assignedMaker.user.email,
        recipientUserId: job.assignedMaker.userId,
        recipientName: job.assignedMaker.displayName,
        isMaker: true,
        jobId: id,
        fileName: job.fileName,
        fromName,
        body: parsed.data.body,
      });
    } else if (session.user.id === job.assignedMaker.userId) {
      // sender is maker → notify creator
      notifyChatMessage({
        recipientEmail: job.creator.email,
        recipientUserId: job.creator.id,
        recipientName: job.creator.name ?? "there",
        isMaker: false,
        jobId: id,
        fileName: job.fileName,
        fromName,
        body: parsed.data.body,
      });
    }
  }

  return NextResponse.json({ message: payload });
}
