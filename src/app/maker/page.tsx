import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet, ListChecks, Hammer, ArrowUpRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/jobs/StatusPill";
import { TestModeBadge } from "@/components/jobs/TestModeBadge";
import { paymentMode } from "@/lib/payments";
import { formatGbp } from "@/lib/money";
import { MakerEarningsCard } from "@/components/maker/MakerEarningsCard";

export const dynamic = "force-dynamic";

export default async function MakerDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/maker");

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });

  // Logged-in user with no maker profile — onboarding state.
  if (!profile) {
    return <MakerOnboardingState />;
  }

  const [activeJobs, openMarketCount, recentBids, payouts] = await Promise.all([
    prisma.job.findMany({
      where: {
        assignedMakerId: profile.id,
        status: { in: ["ASSIGNED", "IN_PROGRESS", "READY_FOR_PICKUP"] },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        creator: { select: { name: true, email: true } },
      },
      take: 10,
    }),
    prisma.job.count({ where: { status: "OPEN" } }),
    prisma.jobBid.findMany({
      where: { makerId: profile.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { job: { select: { id: true, fileName: true, status: true, quotedPricePence: true } } },
      take: 5,
    }),
    prisma.payout.findMany({ where: { makerId: profile.id } }),
  ]);

  const earnedPence = payouts.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountPence, 0);
  const pendingPence = payouts.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amountPence, 0);
  const mode = paymentMode();

  const first = session.user.name?.split(" ")[0] ?? profile.displayName.split(" ")[0];

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-8 md:py-10">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6 md:mb-8">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2 flex items-center gap-3 flex-wrap">
              <span>Maker dashboard · {first}</span>
              {mode === "sim" ? <TestModeBadge /> : null}
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
              {profile.stripeOnboarded
                ? "You're set up to take jobs."
                : <>Finish payout setup <span className="text-black/40">to take paid jobs.</span></>}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/market">
              <Button size="md" variant="primary" withArrow>
                Browse market ({openMarketCount})
              </Button>
            </Link>
            <Link href={`/makers/${profile.id}`}>
              <Button size="md" variant="secondary">
                Public profile
              </Button>
            </Link>
            <Link href="/maker/payouts">
              <Button size="md" variant="secondary">
                {profile.stripeOnboarded ? "Payouts" : "Connect payouts"}
              </Button>
            </Link>
          </div>
        </div>

        <div className="mb-6">
          <MakerEarningsCard makerId={profile.id} />
        </div>

        {profile.stripeOnboarded && earnedPence > 0 ? (
          <div className="mb-5 rounded-xl border border-black/[0.08] bg-black/[0.02] px-5 py-3 text-[12px] font-light text-black/65 leading-snug">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold text-black/55 mr-2">
              How payouts work
            </span>
            We release your share into your Stripe Connect balance the moment a
            pickup is verified. Stripe then pays it out to your bank on its
            own schedule — typically a 7-day rolling delay for the first ~90
            days as a new account, then 2&ndash;3 days automatic. Your live
            balance and bank arrival dates are visible on the{" "}
            <a
              href="https://connect.stripe.com/express_login"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-black"
            >
              Stripe Express dashboard
            </a>
            .
          </div>
        ) : null}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <Kpi
            icon={<ListChecks className="w-3.5 h-3.5" strokeWidth={2.2} />}
            label="Active jobs"
            value={String(activeJobs.length)}
            detail={
              activeJobs.length === 0
                ? "Nothing in progress yet"
                : `${activeJobs.filter(j => j.status === "READY_FOR_PICKUP").length} awaiting pickup`
            }
          />
          <Kpi
            icon={<Wallet className="w-3.5 h-3.5" strokeWidth={2.2} />}
            label="Released to you"
            value={formatGbp(earnedPence)}
            detail={
              earnedPence > 0
                ? "In your Stripe balance · paid to bank on Stripe's schedule"
                : pendingPence > 0
                  ? `${formatGbp(pendingPence)} pending pickup`
                  : "Nothing yet"
            }
          />
          <Kpi
            icon={<Hammer className="w-3.5 h-3.5" strokeWidth={2.2} />}
            label="Pending bids"
            value={String(recentBids.length)}
            detail={recentBids.length === 0 ? "Place a bid in the market" : "Awaiting creator response"}
          />
        </div>

        {/* Active jobs */}
        <Card className="p-0 mb-5">
          <div className="px-5 py-3 border-b border-black/[0.06] flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
              Active jobs
            </div>
            <Link href="/market" className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black inline-flex items-center gap-1">
              Find more <ArrowUpRight className="w-3 h-3" strokeWidth={2.2} />
            </Link>
          </div>
          {activeJobs.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm font-light text-black/55">
              No active jobs. Browse the market to place a bid.
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {activeJobs.map((j) => (
                <li key={j.id} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <Link href={`/maker/jobs/${j.id}`} className="text-sm font-medium hover:underline truncate block">
                      {j.fileName}
                    </Link>
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45 mt-0.5 truncate">
                      {j.creator.name ?? j.creator.email}
                    </div>
                  </div>
                  <StatusPill status={j.status} />
                  <div className="text-right shrink-0 min-w-[80px]">
                    <div className="font-bold tabular-nums">
                      {formatGbp(j.quotedPricePence)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Pending bids */}
        {recentBids.length > 0 ? (
          <Card className="p-0 mb-5">
            <div className="px-5 py-3 border-b border-black/[0.06] font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
              Your pending bids
            </div>
            <ul className="divide-y divide-black/[0.06]">
              {recentBids.map((b) => (
                <li key={b.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <Link href={`/jobs/${b.job.id}`} className="text-sm font-medium hover:underline flex-1 min-w-0 truncate">
                    {b.job.fileName}
                  </Link>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/45">
                    Bid {formatGbp(b.priceOfferPence)} · {b.etaHours}h
                  </span>
                  <StatusPill status={b.job.status} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function MakerOnboardingState() {
  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[720px] mx-auto px-5 md:px-8 py-10 md:py-14">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
          Maker mode
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05] mb-4">
          Become a Fabricate maker.
        </h1>
        <p className="text-sm font-light text-black/65 leading-relaxed mb-6 max-w-md">
          Set up a profile so creators can find you, then connect payouts so
          you can accept paid jobs. Both take under a minute.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/maker/profile">
            <Button size="lg" withArrow>Set up profile</Button>
          </Link>
          <Link href="/makers" className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black">
            What&rsquo;s involved? →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon, label, value, detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-black/45">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]">{label}</span>
      </div>
      <div className="font-black tracking-tight text-2xl md:text-3xl tabular-nums">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-black/45 leading-snug">
        {detail}
      </div>
    </Card>
  );
}
