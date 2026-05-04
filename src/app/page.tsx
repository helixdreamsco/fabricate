import { LandingHero } from "@/components/landing/LandingHero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Footer } from "@/components/landing/Footer";
import { LoggedInHome } from "@/components/home/LoggedInHome";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await auth();

  if (session?.user?.id) {
    const memberships = await prisma.communityMember.findMany({
      where: { userId: session.user.id },
      include: {
        community: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    // Maker counts per community: how many of each community's members
    // have a MakerProfile. One round-trip — group by community.
    const myCommunityIds = memberships.map((m) => m.communityId);
    const makerCountRows = myCommunityIds.length === 0 ? [] : await prisma.communityMember.findMany({
      where: {
        communityId: { in: myCommunityIds },
        user: { makerProfile: { isNot: null } },
      },
      select: { communityId: true },
    });
    const makerCountByCommunity = makerCountRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.communityId] = (acc[r.communityId] ?? 0) + 1;
      return acc;
    }, {});

    const communities = memberships.map((m) => ({
      id: m.community.id,
      slug: m.community.slug,
      name: m.community.name,
      iconHue: m.community.iconHue,
      discountPct: m.community.discountPct,
      freeMode: m.community.freeMode,
      priorityQueue: m.community.priorityQueue,
      memberOnlyMakers: m.community.memberOnlyMakers,
      memberCount: m.community._count.members,
      makerCount: makerCountByCommunity[m.community.id] ?? 0,
    }));

    const first =
      session.user.name?.split(" ")[0] ??
      session.user.email?.split("@")[0] ??
      null;
    return <LoggedInHome userFirstName={first} communities={communities} />;
  }

  return (
    <>
      <LandingHero />
      <HowItWorks />
      <Footer />
    </>
  );
}
