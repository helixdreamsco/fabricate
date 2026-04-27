import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeCommunity } from "@/lib/community-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/communities/:id/join
 * `id` here is expected to be the inviteCode (or the slug — either works).
 * Idempotent: re-joining is a no-op that just returns the community.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ inviteCode: id }, { slug: id }, { id }] },
  });
  if (!c) return NextResponse.json({ error: "invalid invite" }, { status: 404 });

  await prisma.communityMember.upsert({
    where: { communityId_userId: { communityId: c.id, userId: session.user.id } },
    update: {},
    create: { communityId: c.id, userId: session.user.id, role: "member" },
  });

  return NextResponse.json({ community: serializeCommunity(c) });
}
