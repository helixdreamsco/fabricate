import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { imageUploadsDir } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

type Params = { params: Promise<{ name: string }> };

/**
 * Serve a chat-attached image. Access is gated to participants of the job
 * that owns the message this image is attached to (creator or assigned
 * maker). Loose strangers / market readers don't see chat photos.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });

  const { name } = await params;
  if (name.includes("/") || name.includes("..")) {
    return new Response("bad name", { status: 400 });
  }

  const imageUrl = `/api/uploads/image/${name}`;

  // Two paths an image might be referenced from: a chat message attachment
  // or the per-job "completion photo" the maker uploads. Either grants
  // creator + assigned-maker access; otherwise 404 (don't leak existence).
  const message = await prisma.jobMessage.findFirst({
    where: { imageUrl },
    select: {
      jobId: true,
      job: {
        select: {
          creatorId: true,
          assignedMaker: { select: { userId: true } },
        },
      },
    },
  });

  let creatorId: string | undefined;
  let assignedMakerUserId: string | undefined;

  if (message) {
    creatorId = message.job.creatorId;
    assignedMakerUserId = message.job.assignedMaker?.userId;
  } else {
    const job = await prisma.job.findFirst({
      where: { completionPhotoUrl: imageUrl },
      select: {
        creatorId: true,
        assignedMaker: { select: { userId: true } },
      },
    });
    if (!job) return new Response("not found", { status: 404 });
    creatorId = job.creatorId;
    assignedMakerUserId = job.assignedMaker?.userId;
  }

  const isCreator = creatorId === session.user.id;
  const isAssignedMaker = assignedMakerUserId === session.user.id;
  if (!isCreator && !isAssignedMaker) {
    return new Response("forbidden", { status: 403 });
  }

  const path = join(imageUploadsDir(), name);
  try {
    await stat(path);
  } catch {
    return new Response("not found", { status: 404 });
  }
  const buf = await readFile(path);
  const ext = extname(name).toLowerCase();
  return new Response(buf, {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
