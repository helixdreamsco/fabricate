import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { JoinCard } from "@/components/community/JoinCard";

type Props = { params: Promise<{ code: string }> };

export default async function InvitePage({ params }: Props) {
  const { code } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ inviteCode: code }, { slug: code }] },
    include: {
      _count: { select: { members: true } },
      owner: { select: { name: true, image: true } },
    },
  });
  if (!c) notFound();

  const session = await auth();
  const alreadyMember = session?.user?.id
    ? !!(await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: c.id,
            userId: session.user.id,
          },
        },
      }))
    : false;

  return (
    <JoinCard
      preview={{
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
      }}
      signedIn={!!session?.user}
    />
  );
}
