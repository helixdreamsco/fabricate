import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Communities · Group 3D printing for clubs, studios & classes",
  description:
    "Run a 3D-printing community for your class, cosplay group, fashion studio, or tabletop club. Pick the makers, set a discount or print free, and post jobs together on Fabricate.",
  alternates: { canonical: "/communities" },
  openGraph: {
    title: "Fabricate Communities · 3D printing for groups",
    description:
      "Group 3D printing on Fabricate — clubs, studios, classes, cosplay groups. Set discounts, pick makers, post jobs together.",
    url: "/communities",
  },
};

export default async function CommunitiesListPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return <PublicCommunitiesOverview />;
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

function PublicCommunitiesOverview() {
  return (
    <div className="flex-1 bg-grid-none">
      <section className="max-w-[1100px] mx-auto px-5 md:px-8 pt-12 md:pt-20 pb-10">
        <MonoLabel size="md" className="mb-6 block">
          For clubs, studios & classes
        </MonoLabel>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[0.98] max-w-4xl">
          Group 3D printing.
          <br />
          <span className="text-black/45">One Fabricate, one network.</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg md:text-xl font-light text-black/60 leading-relaxed">
          Run a community for your cosplay group, design course, tabletop club,
          fashion studio, or maker collective. Set the discount everyone gets,
          choose which makers print your work, and post jobs together. The
          owner decides the policy — Fabricate handles the printing.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/account?callbackUrl=/communities/new">
            <Button size="lg" withArrow>
              Start a community
            </Button>
          </Link>
          <Link href="/account?callbackUrl=/communities">
            <Button size="lg" variant="secondary">
              Sign in to join
            </Button>
          </Link>
        </div>
      </section>

      <section className="border-y border-black/[0.06] bg-white">
        <div className="max-w-[1100px] mx-auto px-5 md:px-8 py-14 grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            label="Discounts"
            title="Set the price everyone pays."
            body="Owners choose a flat discount across the whole community, all the way down to free prints when the community covers the cost itself."
          />
          <FeatureCard
            label="Curated makers"
            title="Pick who prints your work."
            body="Lock the community to a specific roster of makers — useful for fashion studios, university courses, or anyone who values consistency."
          />
          <FeatureCard
            label="Priority queue"
            title="Skip the open queue."
            body="Community jobs can go to the front of your maker's queue, so members never wait behind every random walk-up order on the network."
          />
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-5 md:px-8 py-14 md:py-20">
        <MonoLabel size="md" className="mb-6 block">
          Who runs communities on Fabricate
        </MonoLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UseCaseCard
            title="Cosplay groups"
            body="Members upload prop and armour files; the community owner brokers a bulk rate with a maker that everyone benefits from."
          />
          <UseCaseCard
            title="Fashion & design studios"
            body="Run prototype and accessory printing for a course or studio. One bill, one quality bar, one printer roster."
          />
          <UseCaseCard
            title="Tabletop clubs"
            body="DM uploads the minis and terrain once, the club gets them at a community rate. Members never need to learn 3D printing."
          />
          <UseCaseCard
            title="Universities & schools"
            body="Set up a community for a design course, hardware club, or architecture studio. Students get reliable, cheap prints; the institution gets one place to manage it."
          />
        </div>
        <div className="mt-10">
          <Link href="/account?callbackUrl=/communities/new">
            <Button size="lg" withArrow>
              Create your free community
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <Card className="p-6 md:p-8 flex flex-col gap-4 min-h-[220px]">
      <MonoLabel size="sm">{label}</MonoLabel>
      <h3 className="text-xl md:text-2xl font-black tracking-tight leading-[1.15]">
        {title}
      </h3>
      <p className="text-sm font-light text-black/60 leading-relaxed">{body}</p>
    </Card>
  );
}

function UseCaseCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-5 md:p-6 flex flex-col gap-3">
      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      <p className="text-sm font-light text-black/60 leading-relaxed">{body}</p>
    </Card>
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
