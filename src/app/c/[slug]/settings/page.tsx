import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { CommunitySettingsForm } from "@/components/community/CommunitySettingsForm";

type Props = { params: Promise<{ slug: string }> };

export default async function CommunitySettingsPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/account");
  const { slug } = await params;

  const c = await prisma.community.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
  });
  if (!c) notFound();
  if (c.ownerId !== session.user.id) redirect(`/c/${c.slug}`);

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1000px] mx-auto px-5 md:px-8 py-8 md:py-12">
        <Link
          href={`/c/${c.slug}`}
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors mb-6"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to community
        </Link>
        <MonoLabel size="md" className="mb-3 block">
          Settings · {c.name}
        </MonoLabel>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight mb-8">
          Tune the rules.
        </h1>

        <CommunitySettingsForm
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
          }}
        />
      </div>
    </div>
  );
}
