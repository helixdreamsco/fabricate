import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TestModeBadge } from "@/components/jobs/TestModeBadge";
import { OnboardingButton } from "./OnboardingButton";
import { RefreshStatusButton } from "./RefreshStatusButton";
import { getOnboardingStatus, paymentMode, type OnboardingState } from "@/lib/payments";
import { formatGbp } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function MakerPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/maker/payouts");

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile) {
    return (
      <div className="flex-1 bg-grid-none">
        <div className="max-w-[720px] mx-auto px-5 md:px-8 py-10">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
            Maker · payouts
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-4">
            Set up your maker profile first
          </h1>
          <p className="text-sm font-light text-black/60 mb-6 max-w-md">
            You need a maker profile before you can connect payouts.
          </p>
          <Link href="/maker/profile">
            <Button size="lg" withArrow>Set up profile</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Re-check Stripe on every render so a maker who's mid-review sees the
  // status change as soon as Stripe finishes (one refresh away).
  let live: OnboardingState | null = null;
  if (profile.stripeAccountId) {
    try {
      live = await getOnboardingStatus(profile.stripeAccountId);
      // Auto-flip the DB flag if Stripe has just confirmed completion.
      if (live.status === "complete" && !profile.stripeOnboarded) {
        await prisma.makerProfile.update({
          where: { id: profile.id },
          data: { stripeOnboarded: true },
        });
        profile.stripeOnboarded = true;
      }
      // And the reverse: if Stripe later restricts the account, drop the
      // local "ready" flag so we don't try to send transfers that will fail.
      if (live.status !== "complete" && profile.stripeOnboarded) {
        await prisma.makerProfile.update({
          where: { id: profile.id },
          data: { stripeOnboarded: false },
        });
        profile.stripeOnboarded = false;
      }
    } catch {
      // If Stripe is briefly unavailable we just skip the live check; UI
      // falls back to the cached `profile.stripeOnboarded` flag.
    }
  }

  const payouts = await prisma.payout.findMany({
    where: { makerId: profile.id },
    orderBy: { createdAt: "desc" },
    include: {
      payment: { include: { job: { select: { id: true, fileName: true } } } },
    },
  });

  const paidPence = payouts.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountPence, 0);
  const pendingPence = payouts.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amountPence, 0);

  const sp = await searchParams;
  const banner = onboardingBannerFor(sp.onboarding);
  const mode = paymentMode();

  // Status text + colour are driven by the live Stripe status when available.
  const statusUI = renderStatus({ profile, live });

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[920px] mx-auto px-5 md:px-8 py-8 md:py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
          Maker · payouts
        </div>
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Payouts
          </h1>
          {mode === "sim" ? <TestModeBadge /> : null}
        </div>

        {banner ? (
          <div className={`mb-6 rounded-xl px-4 py-3 text-sm font-light ${banner.cls}`}>
            {banner.text}
          </div>
        ) : null}

        {/* Status card */}
        <Card className="p-5 md:p-6 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-1 flex items-center gap-2">
                <span>Stripe Connect</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.18em] border ${statusUI.pillCls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusUI.dotCls}`} />
                  {statusUI.label}
                </span>
              </div>
              <div className="text-lg font-bold mb-1">
                {statusUI.heading}
              </div>
              <div className="text-sm font-light text-black/55 max-w-md leading-relaxed">
                {statusUI.body}
              </div>
              {live?.detail ? (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-black/55">
                  {live.detail}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {profile.stripeAccountId && live && live.status !== "complete" ? (
                <RefreshStatusButton />
              ) : null}
              <OnboardingButton
                onboarded={profile.stripeOnboarded}
                ctaLabel={statusUI.ctaLabel}
              />
            </div>
          </div>
        </Card>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Total label="Released to your Stripe balance" amount={paidPence} />
          <Total label="Pending pickup" amount={pendingPence} />
        </div>

        {paidPence > 0 ? (
          <div className="mb-5 rounded-xl border border-black/[0.08] bg-black/[0.02] px-5 py-3 text-[12px] font-light text-black/65 leading-snug">
            Released = sent to your Stripe Connect balance. Stripe pays it
            out to your bank on its own schedule (about 7 days rolling for
            new UK accounts, 2&ndash;3 days after that). See live balance
            and bank arrival dates on the{" "}
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

        {/* List */}
        <Card className="p-0">
          <div className="px-5 py-3 border-b border-black/[0.06] font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
            History
          </div>
          {payouts.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm font-light text-black/55">
              No payouts yet. Your first payout will appear here once a job
              you accepted is picked up by the creator.
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {payouts.map((p) => (
                <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/maker/jobs/${p.payment.job?.id ?? ""}`}
                      className="text-sm font-medium hover:underline truncate block"
                    >
                      {p.payment.job?.fileName ?? p.payment.jobId}
                    </Link>
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45 mt-0.5">
                      {new Date(p.createdAt).toLocaleString("en-GB", {
                        dateStyle: "medium", timeStyle: "short",
                      })}
                      {" · "}
                      {p.mode === "sim" ? "TEST" : "LIVE"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold tabular-nums">
                      {formatGbp(p.amountPence)}
                    </div>
                    <div className={`font-mono text-[9px] uppercase tracking-[0.18em] ${
                      p.status === "PAID" ? "text-emerald-700"
                      : p.status === "FAILED" ? "text-red-700"
                      : "text-black/45"
                    }`}>
                      {p.status === "PAID"
                        ? "Released"
                        : p.status === "FAILED"
                          ? "Failed"
                          : p.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

type StatusUI = {
  label: string;
  heading: string;
  body: string;
  pillCls: string;
  dotCls: string;
  ctaLabel: string;
};

function renderStatus({
  profile,
  live,
}: {
  profile: { stripeAccountId: string | null; stripeOnboarded: boolean };
  live: OnboardingState | null;
}): StatusUI {
  // No Stripe account at all yet.
  if (!profile.stripeAccountId) {
    return {
      label: "Not connected",
      heading: "Not connected",
      body: "Stripe Express handles KYC, bank details, and payout schedules. The onboarding flow will reference helixdreamsco — Fabricate's parent company. You'll be redirected back here when complete.",
      pillCls: "bg-black/[0.04] text-black/55 border-black/[0.08]",
      dotCls: "bg-black/30",
      ctaLabel: "Connect payouts",
    };
  }
  // We have an account — prefer the live Stripe answer; fall back to the
  // cached DB flag if the live fetch failed.
  const status = live?.status ?? (profile.stripeOnboarded ? "complete" : "not_started");
  switch (status) {
    case "complete":
      return {
        label: "Ready",
        heading: "Onboarded — ready to receive payouts",
        body: "You can accept paid jobs. Funds released at pickup verification land here.",
        pillCls: "bg-emerald-500/[0.08] text-emerald-700 border-emerald-500/30",
        dotCls: "bg-emerald-500",
        ctaLabel: "Manage Stripe",
      };
    case "pending":
      return {
        label: "Pending review",
        heading: "Submitted — Stripe is reviewing",
        body: "Stripe is verifying the details you submitted. This usually clears in a few seconds; occasionally a few minutes. You'll be able to accept paid jobs as soon as it does.",
        pillCls: "bg-amber-500/[0.10] text-amber-800 border-amber-500/30",
        dotCls: "bg-amber-500",
        ctaLabel: "Manage Stripe",
      };
    case "action_required":
      return {
        label: "Action required",
        heading: "Stripe needs more info",
        body: "Reopen onboarding to provide the missing details — usually an ID document or extra verification.",
        pillCls: "bg-amber-500/[0.10] text-amber-800 border-amber-500/30",
        dotCls: "bg-amber-500",
        ctaLabel: "Resume onboarding",
      };
    case "restricted":
      return {
        label: "Restricted",
        heading: "Payouts are blocked",
        body: "Stripe has restricted this account. Open the dashboard to see what's needed.",
        pillCls: "bg-red-500/[0.10] text-red-700 border-red-500/30",
        dotCls: "bg-red-500",
        ctaLabel: "Open Stripe",
      };
    case "not_started":
    default:
      return {
        label: "Incomplete",
        heading: "Onboarding incomplete",
        body: "You opened Stripe Express but didn't finish. Pick up where you left off.",
        pillCls: "bg-black/[0.04] text-black/55 border-black/[0.08]",
        dotCls: "bg-black/30",
        ctaLabel: "Resume onboarding",
      };
  }
}

function onboardingBannerFor(s: string | undefined): { text: string; cls: string } | null {
  const base = "border";
  switch (s) {
    case "complete":
      return {
        text: "Onboarding complete. You can now accept paid jobs.",
        cls: `${base} border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-900`,
      };
    case "pending":
      return {
        text: "Submitted. Stripe is reviewing your details — refresh in a few seconds, or use the Refresh button below.",
        cls: `${base} border-amber-500/30 bg-amber-500/[0.06] text-amber-900`,
      };
    case "action_required":
      return {
        text: "Stripe needs more from you to enable payouts. Resume onboarding below.",
        cls: `${base} border-amber-500/30 bg-amber-500/[0.06] text-amber-900`,
      };
    case "restricted":
      return {
        text: "Payouts are restricted on your account. Open Stripe to resolve.",
        cls: `${base} border-red-500/30 bg-red-500/[0.06] text-red-900`,
      };
    case "not_started":
    case "incomplete":
      return {
        text: "Onboarding paused. Resume when you're ready — you can come back here any time.",
        cls: `${base} border-black/[0.08] bg-black/[0.02] text-black/70`,
      };
    case "refresh":
      return {
        text: "Stripe asked for fresh details. Click the button again to reopen onboarding.",
        cls: `${base} border-black/[0.08] bg-black/[0.02] text-black/70`,
      };
    case "missing":
      return {
        text: "We couldn't find your Stripe account. Try connecting again.",
        cls: `${base} border-red-500/30 bg-red-500/[0.06] text-red-900`,
      };
    default:
      return null;
  }
}

function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <Card className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-1">
        {label}
      </div>
      <div className="text-2xl font-black tabular-nums">{formatGbp(amount)}</div>
    </Card>
  );
}
