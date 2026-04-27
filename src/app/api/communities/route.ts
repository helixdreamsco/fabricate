import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  generateInviteCode,
  generateUniqueSlug,
  hashHue,
  serializeCommunity,
} from "@/lib/community-helpers";

const CreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  discountPct: z.number().int().min(0).max(100).default(0),
  freeMode: z.boolean().default(false),
  priorityQueue: z.boolean().default(false),
  memberOnlyMakers: z.boolean().default(false),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const mine = await prisma.communityMember.findMany({
    where: { userId: session.user.id },
    include: {
      community: {
        include: { _count: { select: { members: true, messages: true } } },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json({
    communities: mine.map((m) => ({
      ...serializeCommunity(m.community),
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      memberCount: m.community._count.members,
      messageCount: m.community._count.messages,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const slug = await generateUniqueSlug(input.name);
  const inviteCode = generateInviteCode();
  const iconHue = hashHue(input.name);

  const community = await prisma.community.create({
    data: {
      slug,
      inviteCode,
      iconHue,
      name: input.name,
      description: input.description,
      discountPct: input.freeMode ? 100 : input.discountPct,
      freeMode: input.freeMode,
      priorityQueue: input.priorityQueue,
      memberOnlyMakers: input.memberOnlyMakers,
      ownerId: session.user.id,
      members: {
        create: { userId: session.user.id, role: "owner" },
      },
    },
  });

  return NextResponse.json({ community: serializeCommunity(community) });
}
