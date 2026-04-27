import Link from "next/link";
import { TrendingUp, Hammer, Layers, Activity } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MATERIALS } from "@/lib/catalog";
import { formatGbp } from "@/lib/money";

/**
 * Creator-facing /market view. We don't expose individual jobs here (those
 * are for makers); instead we surface aggregate stats so creators can
 * benchmark their own pricing before they post.
 */

type JobStat = {
  id?: string;
  quotedPricePence: number;
  material: string;
  estimatedGrams: number | null;
  isMultiMaterial: boolean;
  createdAt?: string;
};

type Range = { min: number; max: number; medianPence: number; count: number };

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

function pricePerGramPence(j: JobStat): number | null {
  if (!j.estimatedGrams || j.estimatedGrams <= 0) return null;
  return j.quotedPricePence / j.estimatedGrams;
}

function bucketByGrams(
  jobs: JobStat[],
  range: { min: number; max: number },
): Range {
  const inBucket = jobs.filter((j) =>
    j.estimatedGrams != null && j.estimatedGrams >= range.min && j.estimatedGrams < range.max,
  );
  return {
    min: range.min,
    max: range.max,
    medianPence: median(inBucket.map((j) => j.quotedPricePence)),
    count: inBucket.length,
  };
}

export function CreatorInsights({
  openJobs,
  recentCompleted,
}: {
  openJobs: JobStat[];
  recentCompleted: JobStat[];
}) {
  const all = [...openJobs, ...recentCompleted];

  // Material distribution across open jobs.
  const materialCounts = MATERIALS.map((m) => ({
    key: m.key,
    label: m.label,
    count: openJobs.filter((j) => j.material === m.key).length,
  }));
  const totalOpenWithMaterial = materialCounts.reduce((s, m) => s + m.count, 0) || 1;

  // £/g across the whole pool — drop outliers above the 95th percentile so a
  // single oddly-priced micro-print doesn't skew the headline.
  const ppgs = all.map(pricePerGramPence).filter((x): x is number => x !== null && x > 0);
  ppgs.sort((a, b) => a - b);
  const ppgTrim = ppgs.slice(0, Math.ceil(ppgs.length * 0.95));
  const avgPpg = ppgTrim.length > 0
    ? ppgTrim.reduce((s, x) => s + x, 0) / ppgTrim.length
    : 0;

  // Size buckets (small / medium / large).
  const small = bucketByGrams(all, { min: 0, max: 50 });
  const medium = bucketByGrams(all, { min: 50, max: 200 });
  const large = bucketByGrams(all, { min: 200, max: Infinity });

  // Multi-material premium (median price difference vs single colour).
  const mmJobs = all.filter((j) => j.isMultiMaterial);
  const scJobs = all.filter((j) => !j.isMultiMaterial);
  const mmMedian = median(mmJobs.map((j) => j.quotedPricePence));
  const scMedian = median(scJobs.map((j) => j.quotedPricePence));

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1100px] mx-auto px-5 md:px-8 py-8 md:py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
          Market · price insights
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
            What other prints are going for.
          </h1>
          <Link href="/">
            <Button size="md" withArrow>Post a job</Button>
          </Link>
        </div>
        <p className="text-sm font-light text-black/65 max-w-xl mb-8 leading-relaxed">
          The job feed is for makers. Here&rsquo;s the same data pivoted for
          creators — use it to sanity-check your quote before you post.
          Numbers are over the last 30 days of completed jobs plus all open
          ones.
        </p>

        {/* Headline KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Stat
            icon={<Activity className="w-3.5 h-3.5" strokeWidth={2.2} />}
            label="Open right now"
            value={openJobs.length.toString()}
            sub={openJobs.length === 0 ? "Be the first" : "On the maker market"}
          />
          <Stat
            icon={<TrendingUp className="w-3.5 h-3.5" strokeWidth={2.2} />}
            label="Avg £ / gram"
            value={avgPpg > 0 ? formatGbp(Math.round(avgPpg)) : "—"}
            sub={ppgTrim.length > 0 ? `${ppgTrim.length} samples` : "Not enough data"}
          />
          <Stat
            icon={<Hammer className="w-3.5 h-3.5" strokeWidth={2.2} />}
            label="Multi-material premium"
            value={mmMedian && scMedian
              ? `+${Math.round(((mmMedian - scMedian) / scMedian) * 100)}%`
              : "—"}
            sub={`${mmJobs.length} multi · ${scJobs.length} single`}
          />
          <Stat
            icon={<Layers className="w-3.5 h-3.5" strokeWidth={2.2} />}
            label="Sample size"
            value={String(all.length)}
            sub="Open + last 30d"
          />
        </div>

        {/* Material distribution */}
        <Card className="p-5 md:p-6 mb-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-4">
            Popular materials · open jobs
          </div>
          {totalOpenWithMaterial === 0 ? (
            <div className="text-sm font-light text-black/55 py-4">
              No jobs open yet. Material breakdown will fill in as the market
              gets busier.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {materialCounts
                .sort((a, b) => b.count - a.count)
                .map((m) => {
                  const pct = Math.round((m.count / totalOpenWithMaterial) * 100);
                  return (
                    <li key={m.key} className="flex items-center gap-3">
                      <div className="w-12 font-mono text-[11px] uppercase tracking-[0.18em] shrink-0">
                        {m.label}
                      </div>
                      <div className="flex-1 h-2 rounded-full bg-black/[0.04] overflow-hidden">
                        <div
                          className="h-full bg-[#0a0a0a]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-16 text-right font-mono text-[10px] uppercase tracking-[0.18em] tabular-nums shrink-0">
                        {m.count} · {pct}%
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>

        {/* Median by size */}
        <Card className="p-5 md:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-1">
            Median price by part size
          </div>
          <p className="text-xs font-light text-black/55 mb-5">
            Estimated grams from the slicer drives the bucket. Use this when
            picking a quoted price — match the bucket your part sits in.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SizeBucket label="Small" sub="< 50 g" range={small} />
            <SizeBucket label="Medium" sub="50–200 g" range={medium} />
            <SizeBucket label="Large" sub="≥ 200 g" range={large} />
          </div>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm font-light text-black/55 mb-3">
            Want to see (and bid on) the actual jobs?
          </p>
          <Link href="/maker/profile">
            <Button size="md" variant="secondary">
              Set up a maker profile
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-black/45 mb-1.5">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]">{label}</span>
      </div>
      <div className="text-xl md:text-2xl font-black tabular-nums">{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45 mt-1">
        {sub}
      </div>
    </Card>
  );
}

function SizeBucket({
  label,
  sub,
  range,
}: {
  label: string;
  sub: string;
  range: Range;
}) {
  return (
    <div className="rounded-xl border border-black/[0.08] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/55">
        {label}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/40 mb-2">
        {sub}
      </div>
      <div className="text-xl md:text-2xl font-black tabular-nums">
        {range.count > 0 ? formatGbp(range.medianPence) : "—"}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/40 mt-1">
        {range.count > 0 ? `Median · ${range.count} jobs` : "Not enough data"}
      </div>
    </div>
  );
}
