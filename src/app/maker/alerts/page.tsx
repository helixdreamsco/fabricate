import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { AlertsForm } from "./AlertsForm";

export const dynamic = "force-dynamic";

export default async function MakerAlertsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/maker/alerts");

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, displayName: true },
  });
  if (!profile) redirect("/maker/profile");

  const sub = await prisma.makerSubscription.upsert({
    where: { makerId: profile.id },
    update: {},
    create: { makerId: profile.id },
  });

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[820px] mx-auto px-5 md:px-8 py-8 md:py-10">
        <MonoLabel size="md" className="block mb-2">
          Maker · Alerts &amp; auto-bid
        </MonoLabel>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.05] mb-2">
          Pick what you want to know about — and what you want bid for you.
        </h1>
        <p className="text-sm font-light text-black/60 leading-relaxed mb-8 max-w-2xl">
          Alerts fire the moment a job lands in the open market that fits
          your criteria. Auto-bid goes one step further and places your bid
          for you — only when the listed price clears both the platform&rsquo;s
          floor and your own.
        </p>
        <Card className="p-0">
          <AlertsForm initial={sub} />
        </Card>
      </div>
    </div>
  );
}
