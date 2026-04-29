import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CommunityView } from "@/components/community/CommunityView";
import type { CommunityMakerSummary } from "@/lib/community-types";

type Props = { params: Promise<{ slug: string }> };

export default async function CommunityPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/account");
  const { slug } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ slug }, { inviteCode: slug }, { id: slug }] },
    include: {
      _count: { select: { members: true, messages: true } },
      members: {
        include: {
          user: {
            select: {
              id: true, name: true, email: true, image: true,
              makerProfile: {
                select: {
                  id: true, displayName: true, postcode: true,
                  freeCompletionPhoto: true, stripeOnboarded: true,
                  printers: { orderBy: { priority: "asc" } },
                },
              },
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!c) notFound();

  const me = c.members.find((m) => m.userId === session.user.id);
  if (!me) {
    // Not a member — redirect to the invite flow so they can opt in.
    redirect(`/j/${c.inviteCode}`);
  }

  // Members who happen to be makers — auto-derived, no owner-pick step.
  // Onboarded makers float to the top of the list since they're the ones
  // who can actually take paid work right now.
  const communityMakers: CommunityMakerSummary[] = c.members
    .filter((m) => !!m.user.makerProfile)
    .map((m) => {
      const profile = m.user.makerProfile!;
      const active = profile.printers.filter((p) => p.active);
      const sorted = (active.length > 0 ? active : profile.printers)
        .slice()
        .sort((a, b) => a.priority - b.priority);
      const primary = sorted[0] ?? null;
      return {
        id: profile.id,
        userId: m.userId,
        displayName: profile.displayName,
        printerModel: primary?.printerModel ?? null,
        postcode: profile.postcode,
        hasAMS: primary?.hasAMS ?? false,
        freeCompletionPhoto: profile.freeCompletionPhoto,
        stripeOnboarded: profile.stripeOnboarded,
        role: m.role,
      };
    })
    .sort((a, b) => Number(b.stripeOnboarded) - Number(a.stripeOnboarded));

  return (
    <CommunityView
      community={{
        id: c.id,
        slug: c.slug,
        inviteCode: c.inviteCode,
        name: c.name,
        description: c.description,
        iconHue: c.iconHue,
        ownerId: c.ownerId,
        discountPct: c.discountPct,
        freeMode: c.freeMode,
        priorityQueue: c.priorityQueue,
        memberOnlyMakers: c.memberOnlyMakers,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
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
      }}
      communityMakers={communityMakers}
      meUserId={session.user.id}
    />
  );
}
