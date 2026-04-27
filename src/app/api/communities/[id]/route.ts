import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getMembership,
  serializeCommunity,
} from "@/lib/community-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/communities/:id
 * The `:id` can be the Prisma id, the slug, or the inviteCode — all three
 * resolve to the same row. Membership required unless the invite lookup is
 * being performed by /j/[code] (handled by a separate invite-metadata route).
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }, { inviteCode: id }] },
    include: {
      _count: { select: { members: true, messages: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const me = c.members.find((m) => m.userId === session.user.id);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({
    community: {
      ...serializeCommunity(c),
      memberCount: c._count.members,
      messageCount: c._count.messages,
      role: me.role,
      members: c.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
    },
  });
}

const PatchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  discountPct: z.number().int().min(0).max(100).optional(),
  freeMode: z.boolean().optional(),
  priorityQueue: z.boolean().optional(),
  memberOnlyMakers: z.boolean().optional(),
  rotateInviteCode: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const me = await getMembership(session.user.id, c.id);
  if (!me || me.role !== "owner")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const input = parsed.data;

  const updated = await prisma.community.update({
    where: { id: c.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(input.discountPct !== undefined && {
        discountPct: input.discountPct,
      }),
      ...(input.freeMode !== undefined && { freeMode: input.freeMode }),
      ...(input.priorityQueue !== undefined && {
        priorityQueue: input.priorityQueue,
      }),
      ...(input.memberOnlyMakers !== undefined && {
        memberOnlyMakers: input.memberOnlyMakers,
      }),
      ...(input.rotateInviteCode && {
        inviteCode: (await import("@/lib/community-helpers")).generateInviteCode(),
      }),
    },
  });

  return NextResponse.json({ community: serializeCommunity(updated) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ id }, { slug: id }] },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (c.ownerId !== session.user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.community.delete({ where: { id: c.id } });
  return NextResponse.json({ ok: true });
}
