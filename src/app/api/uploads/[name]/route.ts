import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = join(process.cwd(), "prisma", "uploads");

const TYPES: Record<string, string> = {
  ".stl": "model/stl",
  ".3mf": "model/3mf",
  ".obj": "model/obj",
  ".step": "model/step",
  ".stp": "model/step",
};

type Params = { params: Promise<{ name: string }> };

/**
 * Serve an uploaded mesh file. Access is gated: only the job creator and the
 * assigned maker (or any registered maker if the job is OPEN — they're
 * deciding whether to bid) can fetch it.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });

  const { name } = await params;
  if (name.includes("/") || name.includes("..")) {
    return new Response("bad name", { status: 400 });
  }

  const fileUrl = `/api/uploads/${name}`;
  const job = await prisma.job.findFirst({
    where: { fileUrl },
    select: {
      creatorId: true,
      assignedMaker: { select: { userId: true } },
      status: true,
    },
  });
  if (!job) return new Response("not found", { status: 404 });

  const isCreator = job.creatorId === session.user.id;
  const isAssignedMaker = job.assignedMaker?.userId === session.user.id;
  const isOpen = job.status === "OPEN";
  let isRegisteredMaker = false;
  if (!isCreator && !isAssignedMaker && isOpen) {
    const profile = await prisma.makerProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    isRegisteredMaker = !!profile;
  }
  if (!isCreator && !isAssignedMaker && !isRegisteredMaker) {
    return new Response("forbidden", { status: 403 });
  }

  const path = join(UPLOAD_DIR, name);
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
      "Cache-Control": "private, max-age=300",
    },
  });
}
