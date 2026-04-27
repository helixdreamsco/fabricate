"use client";
import * as React from "react";
import Link from "next/link";
import { Search, Star, Bookmark, EyeOff, Eye, X, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TestModeBadge } from "@/components/jobs/TestModeBadge";
import type { MaterialKey } from "@/lib/catalog";
import { MATERIALS } from "@/lib/catalog";
import { formatGbp } from "@/lib/money";
import { cn } from "@/lib/utils";

type Job = {
  id: string;
  fileName: string;
  material: string;
  partColors: string;
  infillPct: number;
  quantity: number;
  isMultiMaterial: boolean;
  partsCount: number;
  estimatedGrams: number | null;
  estimatedMinutes: number | null;
  quotedPricePence: number;
  notes: string | null;
  createdAt: string;
  creatorName: string | null;
  creatorImage: string | null;
  prioritizedMakerId: string | null;
  bidsCount: number;
};

type Profile = {
  id: string;
  displayName: string;
  printerModel: string | null;
  hasAMS: boolean;
  materials: MaterialKey[];
  stripeOnboarded: boolean;
};

type Tab = "available" | "saved" | "hidden";
type Sort = "match" | "newest" | "price_desc" | "price_asc" | "size_asc";

export function MakerMarket({
  jobs,
  bookmarks,
  myBids,
  profile,
}: {
  jobs: Job[];
  bookmarks: Record<string, string>;
  myBids: Record<string, string>;
  profile: Profile;
}) {
  // Local copy of the bookmark map so we can flip without a full refresh.
  const [bm, setBm] = React.useState(bookmarks);
  const [tab, setTab] = React.useState<Tab>("available");
  const [query, setQuery] = React.useState("");
  const [matchOnly, setMatchOnly] = React.useState(true);
  const [materialFilter, setMaterialFilter] = React.useState<Set<MaterialKey>>(
    new Set(),
  );
  const [sort, setSort] = React.useState<Sort>("match");

  function toggleMaterialFilter(k: MaterialKey) {
    setMaterialFilter((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function setBookmark(jobId: string, status: "SAVED" | "HIDDEN" | null) {
    // Optimistic update
    setBm((prev) => {
      const next = { ...prev };
      if (status === null) delete next[jobId];
      else next[jobId] = status;
      return next;
    });
    try {
      const r = await fetch(`/api/jobs/${jobId}/bookmark`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        // revert
        setBm(bookmarks);
      }
    } catch {
      setBm(bookmarks);
    }
  }

  // Counts per tab.
  const counts = React.useMemo(() => {
    let saved = 0,
      hidden = 0;
    for (const j of jobs) {
      const s = bm[j.id];
      if (s === "SAVED") saved++;
      else if (s === "HIDDEN") hidden++;
    }
    return { available: jobs.length - hidden, saved, hidden };
  }, [jobs, bm]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((j) => {
        const status = bm[j.id];
        // Tab filter.
        if (tab === "saved" && status !== "SAVED") return false;
        if (tab === "hidden" && status !== "HIDDEN") return false;
        if (tab === "available" && status === "HIDDEN") return false;

        // Material filter.
        if (materialFilter.size > 0 && !materialFilter.has(j.material as MaterialKey)) {
          return false;
        }

        // Match-only filter — only on "available" tab.
        if (tab === "available" && matchOnly) {
          if (!isMatchable(j, profile)) return false;
        }

        if (q) {
          const blob = [
            j.fileName,
            j.notes ?? "",
            j.creatorName ?? "",
            j.material,
          ]
            .join(" ")
            .toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      })
      .map((j) => ({ ...j, score: scoreJob(j, profile) }))
      .sort((a, b) => {
        switch (sort) {
          case "match":
            return b.score - a.score || b.createdAt.localeCompare(a.createdAt);
          case "newest":
            return b.createdAt.localeCompare(a.createdAt);
          case "price_desc":
            return b.quotedPricePence - a.quotedPricePence;
          case "price_asc":
            return a.quotedPricePence - b.quotedPricePence;
          case "size_asc":
            return (a.estimatedGrams ?? 0) - (b.estimatedGrams ?? 0);
        }
      });
  }, [jobs, query, tab, matchOnly, materialFilter, sort, bm, profile]);

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-6 md:py-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2 flex items-center gap-3 flex-wrap">
              <span>Open market · {profile.displayName}</span>
              <TestModeBadgeIfNeeded />
              {!profile.stripeOnboarded ? (
                <Link
                  href="/maker/payouts"
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-700 hover:underline"
                >
                  Connect payouts to be selected →
                </Link>
              ) : null}
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
              {counts.available} open · {filtered.length} match{filtered.length === 1 ? "" : "es"}
            </h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-black/[0.08]">
          <TabBtn active={tab === "available"} onClick={() => setTab("available")}>
            Available <span className="text-black/35 ml-1">{counts.available}</span>
          </TabBtn>
          <TabBtn active={tab === "saved"} onClick={() => setTab("saved")}>
            Saved <span className="text-black/35 ml-1">{counts.saved}</span>
          </TabBtn>
          <TabBtn active={tab === "hidden"} onClick={() => setTab("hidden")}>
            Hidden <span className="text-black/35 ml-1">{counts.hidden}</span>
          </TabBtn>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/35"
              strokeWidth={2.2}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filename, notes, creator…"
              className="w-full bg-transparent border border-black/15 rounded-full pl-8 pr-3 py-1.5 text-sm font-light outline-none focus:border-black/50 transition-colors"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="bg-transparent border border-black/15 rounded-full px-3 py-1.5 text-xs font-mono uppercase tracking-[0.16em] outline-none focus:border-black/50 transition-colors"
          >
            <option value="match">Best match</option>
            <option value="newest">Newest</option>
            <option value="price_desc">Price ↓</option>
            <option value="price_asc">Price ↑</option>
            <option value="size_asc">Size ↑</option>
          </select>
        </div>

        {/* Filter pills row */}
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {tab === "available" ? (
            <FilterChip
              icon={<Sparkles className="w-3 h-3" strokeWidth={2.4} />}
              active={matchOnly}
              onClick={() => setMatchOnly((v) => !v)}
            >
              Matches my setup
            </FilterChip>
          ) : null}
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 ml-1">
            <Filter className="w-3 h-3 inline -mt-0.5 mr-1" strokeWidth={2.2} />
            Material
          </span>
          {MATERIALS.map((m) => (
            <FilterChip
              key={m.key}
              active={materialFilter.has(m.key)}
              onClick={() => toggleMaterialFilter(m.key)}
              ghostWhenInactive
            >
              {m.label}
              {profile.materials.includes(m.key) ? (
                <span className="ml-1 text-[8px] text-emerald-700 font-mono">●</span>
              ) : null}
            </FilterChip>
          ))}
          {(matchOnly && tab === "available") || materialFilter.size > 0 || query ? (
            <button
              onClick={() => {
                setMatchOnly(false);
                setMaterialFilter(new Set());
                setQuery("");
              }}
              className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-[0.16em] text-black/55 hover:text-black"
            >
              <X className="w-2.5 h-2.5" strokeWidth={2.4} /> Clear filters
            </button>
          ) : null}
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 mb-1">
              {tab === "saved"
                ? "Nothing saved yet"
                : tab === "hidden"
                  ? "Nothing hidden"
                  : matchOnly
                    ? "No jobs match your setup right now"
                    : "No jobs match your filters"}
            </div>
            <p className="text-sm font-light text-black/55 max-w-md mx-auto leading-relaxed">
              {tab === "available" && matchOnly
                ? "Loosen the match filter or add more materials to your inventory on /maker/profile."
                : "Adjust filters or check back soon."}
            </p>
            {tab === "available" && matchOnly ? (
              <Button
                size="md"
                variant="secondary"
                className="mt-4"
                onClick={() => setMatchOnly(false)}
              >
                Show all open jobs
              </Button>
            ) : null}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                profile={profile}
                bookmark={bm[j.id] ?? null}
                myBidStatus={myBids[j.id] ?? null}
                onSave={() => setBookmark(j.id, bm[j.id] === "SAVED" ? null : "SAVED")}
                onHide={() => setBookmark(j.id, bm[j.id] === "HIDDEN" ? null : "HIDDEN")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Hard match: AMS requirement. Soft: material in inventory. */
function isMatchable(j: Job, p: Profile): boolean {
  if (j.isMultiMaterial && !p.hasAMS) return false;
  // If the maker hasn't set materials we don't gate them out — we just don't
  // boost the score either.
  if (p.materials.length === 0) return true;
  return p.materials.includes(j.material as MaterialKey);
}

function scoreJob(j: Job, p: Profile): number {
  let s = 0;
  if (j.prioritizedMakerId === p.id) s += 50;
  if (j.isMultiMaterial && !p.hasAMS) s -= 100;
  if (p.materials.includes(j.material as MaterialKey)) s += 10;
  // Newer slightly preferred when other things are equal.
  s += Math.max(0, 5 - daysSince(j.createdAt));
  return s;
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function JobCard({
  job,
  profile,
  bookmark,
  myBidStatus,
  onSave,
  onHide,
}: {
  job: Job & { score: number };
  profile: Profile;
  bookmark: string | null;
  myBidStatus: string | null;
  onSave: () => void;
  onHide: () => void;
}) {
  const prioritizedForMe = job.prioritizedMakerId === profile.id;
  const materialMatch = profile.materials.includes(job.material as MaterialKey);
  const amsBlocker = job.isMultiMaterial && !profile.hasAMS;

  return (
    <Card className={cn(
      "p-5 flex flex-col gap-3 relative",
      bookmark === "HIDDEN" && "opacity-60",
    )}>
      <div className="flex items-start gap-3 justify-between">
        <div className="min-w-0">
          <div className="font-medium truncate">{job.fileName}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/45 mt-0.5 truncate">
            {job.creatorName ?? "Creator"} · Creator collects from you
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn
            label={bookmark === "SAVED" ? "Unsave" : "Save"}
            active={bookmark === "SAVED"}
            onClick={onSave}
          >
            <Bookmark
              className={cn("w-3.5 h-3.5", bookmark === "SAVED" && "fill-current")}
              strokeWidth={2.2}
            />
          </IconBtn>
          <IconBtn
            label={bookmark === "HIDDEN" ? "Unhide" : "Hide"}
            active={bookmark === "HIDDEN"}
            onClick={onHide}
          >
            {bookmark === "HIDDEN" ? (
              <Eye className="w-3.5 h-3.5" strokeWidth={2.2} />
            ) : (
              <EyeOff className="w-3.5 h-3.5" strokeWidth={2.2} />
            )}
          </IconBtn>
        </div>
      </div>

      {/* Match indicators */}
      <div className="flex flex-wrap gap-1.5 -mt-1">
        {prioritizedForMe ? (
          <Pill cls="bg-amber-500/15 text-amber-800 border-amber-500/30">
            <Star className="w-2.5 h-2.5" strokeWidth={2.5} /> Prioritized
          </Pill>
        ) : null}
        {amsBlocker ? (
          <Pill cls="bg-red-500/[0.08] text-red-700 border-red-500/25">
            Needs AMS
          </Pill>
        ) : null}
        <Pill cls={materialMatch
          ? "bg-emerald-500/[0.08] text-emerald-800 border-emerald-500/30"
          : "bg-black/[0.04] text-black/55 border-black/[0.08]"}>
          {job.material}
          {materialMatch ? " · in stock" : profile.materials.length > 0 ? " · not stocked" : ""}
        </Pill>
        {job.isMultiMaterial ? (
          <Pill cls="bg-blue-500/[0.08] text-blue-700 border-blue-500/25">
            Multi · {job.partsCount}p
          </Pill>
        ) : null}
        {myBidStatus === "PENDING" ? (
          <Pill cls="bg-black/[0.05] text-black/65 border-black/[0.1]">
            Bid placed
          </Pill>
        ) : null}
      </div>

      {/* Specs */}
      <dl className="grid grid-cols-3 gap-2 text-xs font-light pt-2 border-t border-black/[0.06]">
        <Stat label="Infill" value={`${job.infillPct}%`} />
        <Stat label="Qty" value={String(job.quantity)} />
        <Stat
          label="Est. weight"
          value={job.estimatedGrams ? `${Math.round(job.estimatedGrams)} g` : "—"}
        />
      </dl>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45 mb-0.5">
            Quoted · {job.bidsCount} bid{job.bidsCount === 1 ? "" : "s"}
          </div>
          <div className="text-2xl font-black tabular-nums">
            {formatGbp(job.quotedPricePence)}
          </div>
        </div>
        <Link href={`/jobs/${job.id}`} className="shrink-0">
          <Button size="md" withArrow variant={myBidStatus === "PENDING" ? "secondary" : "primary"}>
            {myBidStatus === "PENDING" ? "View bid" : "View · accept"}
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45 mb-0.5">
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] text-[9px] border",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function TabBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 -mb-px font-mono text-[10px] uppercase tracking-[0.18em] border-b-2 transition-colors",
        active
          ? "border-[#0a0a0a] text-[#0a0a0a]"
          : "border-transparent text-black/45 hover:text-black",
      )}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  children,
  ghostWhenInactive,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  ghostWhenInactive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono uppercase tracking-[0.16em] text-[10px] border transition-colors",
        active
          ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
          : ghostWhenInactive
            ? "bg-transparent text-black/55 border-black/15 hover:border-black/40"
            : "bg-white text-black/65 border-black/15 hover:border-black/40",
      )}
      aria-pressed={active}
    >
      {icon}
      {children}
    </button>
  );
}

function IconBtn({
  active, onClick, label, children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "w-8 h-8 inline-flex items-center justify-center rounded-full transition-colors",
        active
          ? "bg-[#0a0a0a] text-white"
          : "bg-transparent text-black/45 hover:text-black hover:bg-black/[0.06]",
      )}
    >
      {children}
    </button>
  );
}

// Wrapper so we don't fetch payment mode in the client component — the
// server bakes it in via env, but for a client view we just always show the
// badge if NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY isn't set (rough proxy).
function TestModeBadgeIfNeeded() {
  if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return null;
  return <TestModeBadge />;
}
