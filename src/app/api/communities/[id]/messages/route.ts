import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getMembership } from "@/lib/community-helpers";
import { emitCommunityEvent } from "@/lib/events";

type Params = { params: Promise<{ id: string }> };

const SendSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

async function resolveCommunity(id: string) {
  return prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true },
  });
}

/** GET — last N messages, oldest-first for easy rendering. */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = await resolveCommunity(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const member = await getMembership(session.user.id, c.id);
  if (!member)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const limit = Math.min(
    Number(new URL(req.url).searchParams.get("limit") ?? "100") || 100,
    200,
  );

  const messages = await prisma.communityMessage.findMany({
    where: { communityId: c.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json({
    messages: messages
      .map((m) => ({
        id: m.id,
        communityId: m.communityId,
        authorId: m.authorId,
        authorName: m.author.name,
        authorImage: m.author.image,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      }))
      .reverse(),
  });
}

/** POST — send a message. Inserted + broadcast via the SSE bus. */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = await resolveCommunity(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const member = await getMembership(session.user.id, c.id);
  if (!member)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const saved = await prisma.communityMessage.create({
    data: {
      communityId: c.id,
      authorId: session.user.id,
      body: parsed.data.body,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
    },
  });

  const payload = {
    id: saved.id,
    communityId: saved.communityId,
    authorId: saved.authorId,
    authorName: saved.author.name,
    authorImage: saved.author.image,
    body: saved.body,
    createdAt: saved.createdAt.toISOString(),
  };

  emitCommunityEvent({
    type: "message:new",
    communityId: c.id,
    message: payload,
  });

  return NextResponse.json({ message: payload });
}
