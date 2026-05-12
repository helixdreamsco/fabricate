import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { RedeemCodeForm } from "@/components/affiliate/RedeemCodeForm";
import { MintCodeForm } from "@/components/affiliate/MintCodeForm";
import { ShareCode } from "@/components/affiliate/ShareCode";
import { ConnectPayoutsButton } from "@/components/affiliate/ConnectPayoutsButton";
import { AFFILIATE_PAYOUT_THRESHOLD_PENCE } from "@/lib/affiliate";
import { formatGbp } from "@/lib/money";

export const dynamic = "force-dynamic";

type Search = { searchParams?: Promise<{ redeemed?: string }> };

export default async function AccountAffiliatePage({ searchParams }: Search) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/account?callbackUrl=/account/affiliate");
  }

  const q = (await searchParams) ?? {};
  const justRedeemed = q.redeemed === "1";

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      referredByCode: { select: { code: true } },
      affiliateBonusClaimed: true,
      affiliateCodes: {
        select: {
          id: true,
          code: true,
          balancePence: true,
          lifetimeEarnedPence: true,
          paidOutPence: true,
          stripeAccountId: true,
          stripeOnboarded: true,
        },
        take: 1,
      },
    },
  });

  const myCode = me?.affiliateCodes[0] ?? null;
  const recentEarnings = myCode
    ? await prisma.affiliateEarning.findMany({
        where: { codeId: myCode.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          amountPence: true,
          reason: true,
          createdAt: true,
        },
      })
    : [];

  const recentPayouts = myCode
    ? await prisma.affiliatePayout.findMany({
        where: { codeId: myCode.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          amountPence: true,
          status: true,
          paidAt: true,
          createdAt: true,
        },
      })
    : [];

  const progressPct = myCode
    ? Math.min(
        100,
        Math.round(
          (myCode.balancePence / AFFILIATE_PAYOUT_THRESHOLD_PENCE) * 100,
        ),
      )
    : 0;

  const suggestedCode = (me?.name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
  const defaultMintCode = suggestedCode
    ? `NOFEES-${suggestedCode}`
    : "";

  return (
    <div className="flex-1 bg-grid-none py-16">
      <div className="w-full max-w-md mx-auto px-5">
        <div className="text-center mb-10">
          <MonoLabel size="md" className="mb-3 block !text-black">
            Affiliate
          </MonoLabel>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            Refer a friend.
          </h1>
          <p className="mt-4 text-sm font-light text-black/55 leading-relaxed">
            Share your code. Your friend gets their first job&rsquo;s
            fee waived. You earn what fabricate would have charged the
            other side.
          </p>
        </div>

        <Card className="p-6 flex flex-col gap-6">
          <section>
            <MonoLabel size="sm" className="mb-3 block">
              Code on your account
            </MonoLabel>
            {me?.referredByCode ? (
              <div className="rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 flex items-center justify-between">
                <span className="font-mono text-sm">{me.referredByCode.code}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                  {me.affiliateBonusClaimed ? "Used" : "Active"}
                </span>
              </div>
            ) : (
              <RedeemCodeForm justRedeemed={justRedeemed} />
            )}
          </section>

          <section className="pt-6 border-t border-black/[0.06]">
            <MonoLabel size="sm" className="mb-3 block">
              Your code
            </MonoLabel>
            {myCode ? (
              <div className="space-y-4">
                <ShareCode code={myCode.code} />
                {myCode.stripeOnboarded ? null : (
                  <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 space-y-2.5">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-800 font-bold">
                      Payouts not yet connected
                    </div>
                    <p className="text-[12px] font-light text-amber-950 leading-snug">
                      Connect Stripe so we can transfer your balance
                      automatically once it crosses{" "}
                      {formatGbp(AFFILIATE_PAYOUT_THRESHOLD_PENCE)}.
                      Earnings accrue either way.
                    </p>
                    <ConnectPayoutsButton resumed={!!myCode.stripeAccountId} />
                  </div>
                )}
                <div className="rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                      Balance
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatGbp(myCode.balancePence)}
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-emerald-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
                    {progressPct}% of{" "}
                    {formatGbp(AFFILIATE_PAYOUT_THRESHOLD_PENCE)} payout
                    threshold
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[12px] font-light text-black/65">
                  <div className="rounded-lg border border-black/[0.06] px-3 py-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 mb-1">
                      Lifetime earned
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-black">
                      {formatGbp(myCode.lifetimeEarnedPence)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-black/[0.06] px-3 py-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 mb-1">
                      Paid out
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-black">
                      {formatGbp(myCode.paidOutPence)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <MintCodeForm defaultCode={defaultMintCode} />
            )}
          </section>

          {recentEarnings.length > 0 ? (
            <section className="pt-6 border-t border-black/[0.06]">
              <MonoLabel size="sm" className="mb-3 block">
                Recent earnings
              </MonoLabel>
              <ul className="flex flex-col gap-1.5">
                {recentEarnings.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between text-[12px] font-light text-black/70"
                  >
                    <span>
                      {e.reason === "creator_referral"
                        ? "Creator referral"
                        : e.reason === "maker_referral"
                          ? "Maker referral"
                          : "Collision consolation"}
                    </span>
                    <span className="font-mono tabular-nums">
                      +{formatGbp(e.amountPence)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {recentPayouts.length > 0 ? (
            <section className="pt-6 border-t border-black/[0.06]">
              <MonoLabel size="sm" className="mb-3 block">
                Recent payouts
              </MonoLabel>
              <ul className="flex flex-col gap-1.5">
                {recentPayouts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between text-[12px] font-light text-black/70"
                  >
                    <span>
                      {p.status === "PAID"
                        ? "Paid"
                        : p.status === "FAILED"
                          ? "Failed"
                          : "Pending"}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatGbp(p.amountPence)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Card>

        <div className="mt-8 text-center">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to account
          </Link>
        </div>
      </div>
    </div>
  );
}
