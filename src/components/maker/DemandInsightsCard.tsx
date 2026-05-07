import Link from "next/link";
import { TrendingUp, Inbox } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import {
  computeMakerActionableGaps,
  type MakerActionableGap,
} from "@/lib/demand-insights";

/**
 * Per-maker "what's wanted right now" card.
 *
 * Three layers, top to bottom:
 *   1. Actionable gaps — under-served categories the maker doesn't yet
 *      serve (where buying filament / an AMS would put them in front of
 *      unfilled demand).
 *   2. Demand mix bars — last 30 days, jobs requested vs bids accepted
 *      per material, plus an AMS row. Always renders when there's
 *      enough signal, so the card stays informative even when there are
 *      no gaps.
 *   3. Footer — methodology footnote.
 */
export async function DemandInsightsCard({ makerId }: { makerId: string }) {
  const { insights, gaps } = await computeMakerActionableGaps({ makerId });

  if (!insights.hasEnoughSignal) {
    return (
      <Card className="p-5">
        <Header />
        <p className="text-sm font-light text-black/65 leading-relaxed mt-2">
          Not enough recent activity to draw conclusions yet. Check back
          once the marketplace has a few more jobs in the last 30 days.
        </p>
      </Card>
    );
  }

  // Sort materials by demand desc; drop materials with both counts at zero
  // unless they're a canonical key (so the maker still sees PLA/PETG/ABS/TPU
  // even with zero demand — that's useful baseline info).
  const sortedMaterials = [...insights.materials]
    .filter(
      (m) => m.jobsLast30d > 0 || m.acceptedBidsLast30d > 0 || isCanonical(m.material),
    )
    .sort((a, b) => b.jobsLast30d - a.jobsLast30d);

  const maxScale = Math.max(
    insights.ams.totalJobsLast30d,
    ...sortedMaterials.map((m) => m.jobsLast30d),
    1,
  );

  return (
    <Card className="p-5">
      <Header
        action={
          <Link
            href="/maker/profile"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black underline underline-offset-4"
          >
            Update your setup →
          </Link>
        }
      />

      {/* Layer 1 — actionable gaps */}
      {gaps.length > 0 ? (
        <div className="mt-3">
          <div className="text-[12px] font-light text-black/55 leading-relaxed mb-2">
            Categories where jobs are coming in faster than makers are taking
            them, and you don&rsquo;t currently serve. Adding any to your
            printer setup would put you in front of demand the market
            isn&rsquo;t clearing.
          </div>
          <ul className="flex flex-col gap-2">
            {gaps.map((g, i) => (
              <li key={i}>
                <GapRow gap={g} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12px] font-light text-black/55 leading-relaxed mt-2">
          Demand looks well-matched to your current setup — you cover the
          under-served categories that exist right now.
        </p>
      )}

      {/* Layer 2 — demand mix */}
      <div className="mt-4 pt-4 border-t border-black/[0.06]">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
          Demand mix · last 30 days
        </div>
        <ul className="flex flex-col gap-2">
          {sortedMaterials.map((m) => (
            <li key={m.material}>
              <MixRow
                label={m.material}
                jobs={m.jobsLast30d}
                accepted={m.acceptedBidsLast30d}
                maxScale={maxScale}
              />
            </li>
          ))}
          <li>
            <MixRow
              label="Multi-material"
              jobs={insights.ams.multiMaterialJobsLast30d}
              accepted={insights.ams.acceptedMultiMaterialBidsLast30d}
              maxScale={maxScale}
              muted
            />
          </li>
        </ul>
        <div className="mt-2 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-[#7c3aed]" />
            Accepted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-[#7c3aed]/[0.18]" />
            Unfilled
          </span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-black/[0.06] font-mono text-[9px] uppercase tracking-[0.18em] text-black/35">
        Aggregate counts only · last 30 days · ≥3-job threshold
      </div>
    </Card>
  );
}

function Header({ action }: { action?: React.ReactNode } = {}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 text-black/65">
        <TrendingUp className="w-3.5 h-3.5" strokeWidth={2.2} />
        <MonoLabel size="sm" className="!text-black/65">
          What&rsquo;s wanted right now
        </MonoLabel>
      </div>
      {action ?? null}
    </div>
  );
}

function isCanonical(m: string) {
  return m === "PLA" || m === "PETG" || m === "ABS" || m === "TPU";
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

function MixRow({
  label,
  jobs,
  accepted,
  maxScale,
  muted,
}: {
  label: string;
  jobs: number;
  accepted: number;
  maxScale: number;
  muted?: boolean;
}) {
  // Total bar width represents jobs requested as a fraction of the busiest
  // category. Inside the bar, the filled segment is accepted bids; the
  // remainder is unfilled.
  const totalPct = (jobs / maxScale) * 100;
  const filledPct = jobs === 0 ? 0 : (accepted / jobs) * 100;
  const unfilled = Math.max(0, jobs - accepted);

  return (
    <div className="flex items-center gap-3">
      <div
        className={`shrink-0 w-20 font-mono text-[11px] tracking-[0.04em] ${muted ? "text-black/45" : "text-black/65"}`}
      >
        {label}
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative h-1.5 rounded-full bg-black/[0.05] overflow-hidden">
          {jobs > 0 ? (
            <div
              className="absolute inset-y-0 left-0 bg-[#7c3aed]/[0.18]"
              style={{ width: `${totalPct}%` }}
            />
          ) : null}
          {accepted > 0 ? (
            <div
              className="absolute inset-y-0 left-0 bg-[#7c3aed]"
              style={{ width: `${(totalPct * filledPct) / 100}%` }}
            />
          ) : null}
        </div>
      </div>
      <div className="shrink-0 w-28 text-right font-mono text-[10px] text-black/55 tabular-nums">
        {jobs === 0 ? (
          <span className="text-black/30">no demand</span>
        ) : unfilled === 0 ? (
          <>
            {jobs} / {jobs} <span className="text-black/35">filled</span>
          </>
        ) : (
          <>
            {accepted} / {jobs} <span className="text-black/35">filled</span>
          </>
        )}
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
