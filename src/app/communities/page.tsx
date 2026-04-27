import Link from "next/link";
import { Plus, ArrowRight, Users2, MessageSquare } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { PolicyBadges } from "@/components/community/PolicyBadges";
import { JoinWithCodeInline } from "@/components/community/JoinWithCodeInline";

export default async function CommunitiesListPage() {
  const session = await auth();
  if (!session?.user?.id) {
    // Middleware should have caught this; fail-closed.
    return null;
  }

  const memberships = await prisma.communityMember.findMany({
    where: { userId: session.user.id },
    include: {
      community: {
        include: { _count: { select: { members: true, messages: true } } },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-10 md:py-14">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-10">
          <div>
            <MonoLabel size="md" className="mb-3 block">
              Your communities
            </MonoLabel>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">
              {memberships.length === 0
                ? "Start or join a community."
                : `${memberships.length} ${
                    memberships.length === 1 ? "community" : "communities"
                  }.`}
            </h1>
          </div>
          <Link href="/communities/new">
            <Button size="lg" withArrow startIcon={<Plus className="w-4 h-4 mr-1" />}>
              New community
            </Button>
          </Link>
        </div>

        {memberships.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {memberships.map((m) => (
              <CommunityCard
                key={m.community.id}
                community={m.community}
                role={m.role}
                memberCount={m.community._count.members}
                messageCount={m.community._count.messages}
              />
            ))}
          </div>
        )}

        <div className="mt-16 border-t border-black/[0.08] pt-8">
          <MonoLabel size="md" className="mb-3 block">
            Got an invite?
          </MonoLabel>
          <p className="text-sm font-light text-black/55 leading-relaxed max-w-xl mb-4">
            Paste the invite link — or if someone sent you a short code, drop
            it below to join.
          </p>
          <JoinWithCodeInline />
        </div>
      </div>
    </div>
  );
}

function CommunityCard({
  community,
  role,
  memberCount,
  messageCount,
}: {
  community: {
    id: string;
    slug: string;
    inviteCode: string;
    name: string;
    description: string | null;
    iconHue: number;
    discountPct: number;
    freeMode: boolean;
    priorityQueue: boolean;
    memberOnlyMakers: boolean;
  };
  role: string;
  memberCount: number;
  messageCount: number;
}) {
  return (
    <Link
      href={`/c/${community.slug}`}
      className="group"
    >
      <Card
        className="p-5 flex flex-col gap-4 h-full transition-colors hover:border-black/30"
      >
        <div className="flex items-start gap-4">
          <CommunityAvatar
            name={community.name}
            hue={community.iconHue}
            size={56}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-black tracking-tight truncate">
                {community.name}
              </h3>
              {role === "owner" ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#0a0a0a] bg-black/[0.04] px-2 py-0.5 rounded-full">
                  Owner
                </span>
              ) : null}
            </div>
            <p className="text-sm font-light text-black/55 line-clamp-2 mt-1">
              {community.description || "No description."}
            </p>
          </div>
        </div>

        <PolicyBadges policy={community} />

        <div className="mt-auto pt-3 border-t border-black/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.15em] text-black/50">
            <span className="inline-flex items-center gap-1.5">
              <Users2 className="w-3 h-3" />
              {memberCount}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              {messageCount}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-black/30 group-hover:text-black group-hover:translate-x-0.5 transition-all" />
        </div>
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <Card className="p-10 md:p-14 text-center flex flex-col items-center gap-5">
      <div className="w-16 h-16 rounded-2xl border border-black/10 bg-white flex items-center justify-center">
        <Users2 className="w-6 h-6 text-black/55" />
      </div>
      <div>
        <h2 className="text-2xl font-black tracking-tight mb-2">
          A community of your own.
        </h2>
        <p className="text-sm font-light text-black/55 max-w-md mx-auto leading-relaxed">
          Set up a group for your class, team, or studio. Pick the makers
          everyone can use, set a discount — or hand out prints for free.
        </p>
      </div>
      <Link href="/communities/new">
        <Button size="lg" withArrow>
          Create your first community
        </Button>
      </Link>
    </Card>
  );
}

