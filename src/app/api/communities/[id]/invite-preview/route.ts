import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/communities/:id/invite-preview
 *
 * Used by the /j/[code] join page to show community metadata BEFORE the user
 * joins. Does not leak member identities — only public-ish fields.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const c = await prisma.community.findFirst({
    where: { OR: [{ inviteCode: id }, { slug: id }] },
    include: {
      _count: { select: { members: true } },
      owner: { select: { name: true, image: true } },
    },
  });
  if (!c) return NextResponse.json({ error: "invalid invite" }, { status: 404 });

  const session = await auth();
  const alreadyMember = session?.user?.id
    ? !!(await prisma.communityMember.findUnique({
        where: {
          communityId_userId: { communityId: c.id, userId: session.user.id },
        },
      }))
    : false;

  return NextResponse.json({
    preview: {
      id: c.id,
      slug: c.slug,
      inviteCode: c.inviteCode,
      name: c.name,
      description: c.description,
      iconHue: c.iconHue,
      ownerName: c.owner.name,
      ownerImage: c.owner.image,
      memberCount: c._count.members,
      discountPct: c.discountPct,
      freeMode: c.freeMode,
      priorityQueue: c.priorityQueue,
      alreadyMember,
    },
  });
}
