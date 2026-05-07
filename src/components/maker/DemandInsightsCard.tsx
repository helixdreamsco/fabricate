import Link from "next/link";
import { TrendingUp, Inbox } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import {
  computeMakerActionableGaps,
  type MakerActionableGap,
} from "@/lib/demand-insights";

/**
 * Per-maker "what's wanted right now" card. Surfaces 1-3 actionable gaps
 * — under-served materials the maker could add to their stock, and the
 * AMS gap if multi-material jobs are popular but they don't have one.
 *
 * Renders nothing controversial when there's not enough signal — explicit
 * empty-state copy steers the maker back to /market.
 */
export async function DemandInsightsCard({ makerId }: { makerId: string }) {
  const { insights, gaps } = await computeMakerActionableGaps({ makerId });

  if (!insights.hasEnoughSignal) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-black/55 mb-2">
          <TrendingUp className="w-3.5 h-3.5" strokeWidth={2.2} />
          <MonoLabel size="sm" className="!text-black/55">
            What&rsquo;s wanted right now
          </MonoLabel>
        </div>
        <p className="text-sm font-light text-black/65 leading-relaxed">
          Not enough recent activity to draw conclusions yet. Check back
          once the marketplace has a few more jobs in the last 30 days.
        </p>
      </Card>
    );
  }

  if (gaps.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-black/55 mb-2">
          <TrendingUp className="w-3.5 h-3.5" strokeWidth={2.2} />
          <MonoLabel size="sm" className="!text-black/55">
            What&rsquo;s wanted right now
          </MonoLabel>
        </div>
        <p className="text-sm font-light text-black/65 leading-relaxed">
          Demand looks well-matched to your current setup. Nice — you cover
          the under-served categories that exist right now.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 text-black/65">
          <TrendingUp className="w-3.5 h-3.5" strokeWidth={2.2} />
          <MonoLabel size="sm" className="!text-black/65">
            What&rsquo;s wanted right now
          </MonoLabel>
        </div>
        <Link
          href="/maker/profile"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black underline underline-offset-4"
        >
          Update your setup →
        </Link>
      </div>
      <div className="text-[12px] font-light text-black/55 leading-relaxed mb-3">
        Categories where jobs are coming in faster than makers are taking
        them, and you don&rsquo;t currently serve. Adding any to your printer
        setup would put you in front of demand the market isn&rsquo;t
        clearing.
      </div>
      <ul className="flex flex-col gap-2">
        {gaps.map((g, i) => (
          <li key={i}>
            <GapRow gap={g} />
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-3 border-t border-black/[0.06] font-mono text-[9px] uppercase tracking-[0.18em] text-black/35">
        Aggregate counts only · last 30 days · ≥3-job threshold
      </div>
    </Card>
  );
}

function GapRow({ gap }: { gap: MakerActionableGap }) {
  if (gap.kind === "material") {
    const unfilled = gap.jobsLast30d - gap.acceptedBidsLast30d;
    return (
      <div className="flex items-start gap-3 px-3 py-2 rounded-lg border border-black/[0.08] bg-black/[0.02]">
        <div className="w-7 h-7 rounded-full bg-[#7c3aed]/[0.10] text-[#7c3aed] flex items-center justify-center font-mono text-[10px] font-bold tracking-[0.04em] shrink-0 mt-0.5">
          {gap.material.slice(0, 3)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {gap.material} demand outpacing supply
          </div>
          <div className="text-[12px] font-light text-black/55 mt-0.5 leading-snug">
            {gap.jobsLast30d} job{gap.jobsLast30d === 1 ? "" : "s"} requested
            in the last 30 days, only {gap.acceptedBidsLast30d} bid
            {gap.acceptedBidsLast30d === 1 ? "" : "s"} accepted —{" "}
            {unfilled} unfilled. You don&rsquo;t currently stock {gap.material}.
          </div>
        </div>
      </div>
    );
  }
  const unfilled =
    gap.multiMaterialJobsLast30d - gap.acceptedMultiMaterialBidsLast30d;
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-lg border border-black/[0.08] bg-black/[0.02]">
      <div className="w-7 h-7 rounded-full bg-[#7c3aed]/[0.10] text-[#7c3aed] flex items-center justify-center font-mono text-[10px] font-bold tracking-[0.04em] shrink-0 mt-0.5">
        AMS
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          Multi-material demand outpacing supply
        </div>
        <div className="text-[12px] font-light text-black/55 mt-0.5 leading-snug">
          {gap.multiMaterialJobsLast30d} multi-material job
          {gap.multiMaterialJobsLast30d === 1 ? "" : "s"} requested in the last
          30 days, only {gap.acceptedMultiMaterialBidsLast30d} accepted —{" "}
          {unfilled} unfilled. You don&rsquo;t have an AMS-equipped printer.
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny placeholder used when /maker is rendering for a profile-less user.
 * Same height as the real card to keep the dashboard layout stable.
 */
export function DemandInsightsPlaceholder() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-black/45 mb-2">
        <Inbox className="w-3.5 h-3.5" strokeWidth={2.2} />
        <MonoLabel size="sm" className="!text-black/45">
          Demand insights
        </MonoLabel>
      </div>
      <p className="text-sm font-light text-black/55 leading-relaxed">
        Set up your printer first — once we know what you stock we can show
        the marketplace gaps you&rsquo;re positioned to fill.
      </p>
    </Card>
  );
}
