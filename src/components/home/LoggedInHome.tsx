"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  UploadCloud,
  MapPin,
  RefreshCw,
  Check,
  ChevronDown,
  SlidersHorizontal,
  Users2,
} from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { MATERIALS, type Maker } from "@/lib/catalog";
import { cn, formatDistance, formatGBP } from "@/lib/utils";
import { analyzeSTL } from "@/lib/stl";
import { postAnalyze } from "@/lib/api";
import {
  defaultPartColors,
  useOrder,
  type CommunityContext,
} from "@/lib/order-store";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import {
  SORT_LABELS,
  scoreMakers,
  sortMakers,
  type MakerScore,
  type SortKey,
} from "@/lib/maker-filters";
import type { MakerProfileSummary } from "@/lib/maker-profile";

const FleetMap = dynamic(
  () => import("./FleetMap").then((m) => m.FleetMap),
  { ssr: false, loading: () => <MapPlaceholder /> },
);

const FALLBACK_CENTER = { lat: 51.5074, lng: -0.1278 };

type Coord = { lat: number; lng: number };
type LocState =
  | { kind: "pending" }
  | { kind: "granted"; coord: Coord }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "timeout" }
  | { kind: "unsupported" };

export type CommunityForScope = CommunityContext & {
  memberOnlyMakers: boolean;
  memberCount: number;
  /** How many of this community's members have a MakerProfile. */
  makerCount: number;
};

export function LoggedInHome({
  userFirstName,
  communities,
}: {
  userFirstName: string | null;
  communities: CommunityForScope[];
}) {
  const router = useRouter();
  const { draft, set } = useOrder();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [loc, setLoc] = React.useState<LocState>({ kind: "pending" });
  const [selected, setSelected] = React.useState<string | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [scopeId, setScopeId] = React.useState<string | null>(null); // community id or null for "all"
  const [sortKey, setSortKey] = React.useState<SortKey>("nearest");
  const [showFitting, setShowFitting] = React.useState(false); // filter: only show compat
  const [realMakers, setRealMakers] = React.useState<MakerProfileSummary[]>([]);
  const [makersLoading, setMakersLoading] = React.useState(true);

  // Pull real maker profiles from the DB. includeSelf=true so a maker
  // viewing the homepage sees their own listing — they're a member of
  // the marketplace just like anyone else.
  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/makers?includeSelf=true")
      .then((r) => (r.ok ? r.json() : { makers: [] }))
      .then((j: { makers?: MakerProfileSummary[] }) => {
        if (cancelled) return;
        setRealMakers(j.makers ?? []);
        setMakersLoading(false);
      })
      .catch(() => {
        if (!cancelled) setMakersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Geolocate on mount. Persist to the order draft so /configure can use it
  // for courier-availability checks without re-prompting the user.
  React.useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLoc({ kind: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLoc({ kind: "granted", coord });
        set({ userCoord: coord });
      },
      (err) => {
        // Distinguish PERMISSION_DENIED (1) from POSITION_UNAVAILABLE (2,
        // e.g. macOS Location Services off for the browser, no Wi-Fi
        // triangulation) and TIMEOUT (3). The badge shows different help
        // copy per case so the user can fix the actual problem.
        if (err.code === 1) setLoc({ kind: "denied" });
        else if (err.code === 3) setLoc({ kind: "timeout" });
        else setLoc({ kind: "unavailable" });
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
    );
  }, [set]);

  const referenceCoord: Coord =
    loc.kind === "granted" ? loc.coord : FALLBACK_CENTER;

  const activeCommunity = scopeId
    ? communities.find((c) => c.id === scopeId) ?? null
    : null;

  // The static catalogue of fake makers was retired pre-launch. The list
  // panel below is populated from /api/makers (realMakers state); the
  // FleetMap takes a Maker[]-shaped adaptation of those rows for the
  // markers it can plot — only makers whose postcode resolved to lat/lng
  // are mapped. Other Maker fields the map doesn't actually read are
  // stubbed with safe defaults; the list view never sees this array.
  const inScopeMakers: Maker[] = [];

  const mapMakers: Maker[] = React.useMemo(() => {
    return realMakers
      .filter(
        (m): m is typeof m & { lat: number; lng: number } =>
          m.lat != null && m.lng != null,
      )
      .map((m) => ({
        id: m.id,
        name: m.displayName,
        area: m.postcode ?? "",
        postcode: m.postcode ?? "",
        printer: m.printerModel ?? "",
        statusEta: m.stripeOnboarded ? "Available" : "Setup pending",
        rating: 0,
        lat: m.lat,
        lng: m.lng,
        available: m.stripeOnboarded,
        materials: [],
        buildVolumeMm: { x: 256, y: 256, z: 256 },
        queueMins: 0,
        machineRateGbpPerHour: 0,
        supportsMultiMaterial: m.hasAMS,
      }));
  }, [realMakers]);

  // Score + sort.
  const analysisLite = draft.analysis
    ? { volumeCm3: draft.analysis.volumeCm3, dimsMm: draft.analysis.dimsMm }
    : null;

  const needsMultiMaterial = draft.analysis?.isMultiMaterial ?? false;

  const scored: MakerScore[] = React.useMemo(
    () =>
      scoreMakers({
        makers: inScopeMakers,
        user: referenceCoord,
        analysis: analysisLite,
        preferredMaterial: draft.material,
        discountPct: activeCommunity?.discountPct ?? 0,
        freeMode: activeCommunity?.freeMode ?? false,
        needsMultiMaterial,
      }),
    [
      inScopeMakers,
      referenceCoord.lat,
      referenceCoord.lng,
      analysisLite,
      draft.material,
      activeCommunity?.discountPct,
      activeCommunity?.freeMode,
      needsMultiMaterial,
    ],
  );

  const visible = React.useMemo(() => {
    const filtered = showFitting
      ? scored.filter(
          (m) =>
            m.compatibility.fits !== false &&
            m.compatibility.supportsMaterial !== false &&
            m.compatibility.supportsMultiMaterialIfNeeded !== false,
        )
      : scored;
    return sortMakers(filtered, sortKey);
  }, [scored, sortKey, showFitting]);

  const onFile = async (f: File) => {
    setUploadErr(null);
    setAnalyzing(true);
    try {
      const [analysis, serverAnalysis] = await Promise.all([
        analyzeSTL(f),
        postAnalyze(f).catch((e) => {
          console.warn("server analyze failed, degrading:", e);
          return null;
        }),
      ]);
      // No static catalogue to pick from any more — prioritized maker is
      // chosen via the bid flow on the job page, not at upload time.
      const chosen = null;
      const community: CommunityContext | null = activeCommunity
        ? {
            id: activeCommunity.id,
            slug: activeCommunity.slug,
            name: activeCommunity.name,
            iconHue: activeCommunity.iconHue,
            discountPct: activeCommunity.discountPct,
            freeMode: activeCommunity.freeMode,
            priorityQueue: activeCommunity.priorityQueue,
          }
        : null;
      const partColors = defaultPartColors(
        analysis,
        MATERIALS[0].colors[0].hex,
      );
      set({
        file: f,
        analysis,
        serverAnalysis,
        partColors,
        community,
        ...(chosen ? { maker: chosen } : {}),
      });
      router.push("/configure");
    } catch (e) {
      console.error(e);
      setUploadErr("Could not parse that file. Make sure it is a valid STL.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-grid-none">
      {/* Thin header row with greeting + loc status */}
      <div className="max-w-[1600px] w-full mx-auto px-5 md:px-8 pt-6 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl md:text-2xl font-black tracking-tight">
            {userFirstName ? `Welcome back, ${userFirstName}.` : "Welcome back."}
          </h1>
          <MonoLabel size="md">Upload a file to get a quote.</MonoLabel>
        </div>
        <LocationBadge loc={loc} onRetry={() => setLoc({ kind: "pending" })} />
      </div>

      {/* Toolbar: scope + sort */}
      <div className="max-w-[1600px] w-full mx-auto px-5 md:px-8 pb-2 flex items-center gap-3 flex-wrap">
        <ScopeSelector
          communities={communities}
          activeId={scopeId}
          onChange={setScopeId}
        />
        <SortSelector
          value={sortKey}
          onChange={setSortKey}
          hasAnalysis={!!draft.analysis}
        />
        <button
          onClick={() => setShowFitting((s) => !s)}
          disabled={!draft.analysis}
          className={cn(
            "inline-flex items-center gap-2 h-8 px-3 rounded-full border transition-all disabled:opacity-40 disabled:cursor-not-allowed",
            showFitting
              ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
              : "bg-white border-black/15 hover:bg-black/[0.04]",
          )}
          title={
            draft.analysis
              ? "Only show printers that fit this model"
              : "Upload an STL to filter by compatibility"
          }
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
            Fits my part
          </span>
        </button>
        <div className="ml-auto">
          <MonoLabel size="sm">
            {makersLoading
              ? "Loading…"
              : `${realMakers.length} ${realMakers.length === 1 ? "maker" : "makers"}`}
            {activeCommunity && activeCommunity.priorityQueue
              ? " · priority queue"
              : ""}
          </MonoLabel>
        </div>
      </div>

      {/* Workbench */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto px-5 md:px-8 pb-8 pt-2 grid grid-cols-1 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4 min-h-[70vh]">
        {/* Left column: upload + makers */}
        <div className="flex flex-col gap-4 min-h-0 md:max-h-[calc(100vh-220px)]">
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            onClick={() => fileInput.current?.click()}
            className={cn(
              "cursor-pointer rounded-2xl border border-dashed bg-white px-5 py-5 flex items-center gap-4 transition-all",
              dragging
                ? "border-black/60 bg-black/[0.02]"
                : "border-black/15 hover:border-black/40",
            )}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".stl,.3mf,.obj,.step,.stp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <div className="w-12 h-12 rounded-2xl border border-black/10 bg-white flex items-center justify-center shrink-0">
              <UploadCloud className="w-5 h-5 text-black/70" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="text-lg font-black tracking-tight leading-tight">
                {analyzing
                  ? "Analysing mesh…"
                  : dragging
                    ? "Drop to analyse"
                    : activeCommunity
                      ? `Upload to ${activeCommunity.name}`
                      : "Drop an STL or click"}
              </div>
              <div className="text-xs font-mono uppercase tracking-[0.15em] text-black/40 mt-1">
                STL · 3MF · OBJ · max 80 MB
              </div>
            </div>
            <Button withArrow size="md" className="hidden sm:inline-flex">
              Upload
            </Button>
          </div>
          {uploadErr ? (
            <div className="text-[12px] text-[#ef4444] font-mono">
              {uploadErr}
            </div>
          ) : null}

          <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-black/[0.08] overflow-hidden">
            <div className="px-5 py-3 border-b border-black/[0.06] flex items-center justify-between">
              <MonoLabel size="md" className="!text-black">
                {activeCommunity
                  ? `${activeCommunity.name} · makers`
                  : "Available makers"}
              </MonoLabel>
              <MonoLabel size="sm">
                Sort: {SORT_LABELS[sortKey]}
              </MonoLabel>
            </div>
            <ol className="flex-1 overflow-y-auto divide-y divide-black/[0.06]">
              {makersLoading ? (
                <li className="p-10 text-center">
                  <MonoLabel size="md" className="block">Loading makers…</MonoLabel>
                </li>
              ) : realMakers.length === 0 ? (
                <EmptyMakers scope={activeCommunity?.name ?? null} />
              ) : (
                realMakers.map((m) => (
                  <RealMakerRow
                    key={m.id}
                    m={m}
                    isSelf={currentUserId === m.userId}
                  />
                ))
              )}
            </ol>
          </div>
        </div>

        {/* Right column: map. Explicit heights so Leaflet's absolutely-
            positioned container has something to fill. */}
        <div className="relative bg-white rounded-2xl border border-black/[0.08] overflow-hidden min-h-[55vh] md:min-h-[70vh] md:h-[calc(100vh-220px)]">
          <FleetMap
            makers={mapMakers}
            user={loc.kind === "granted" ? loc.coord : null}
            selectedMakerId={selected}
            onSelect={setSelected}
          />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

function ScopeSelector({
  communities,
  activeId,
  onChange,
}: {
  communities: CommunityForScope[];
  activeId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);
  const active = activeId ? communities.find((c) => c.id === activeId) : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 h-8 pl-2 pr-3 rounded-full border border-black/15 bg-white hover:bg-black/[0.04] transition-colors"
      >
        {active ? (
          <>
            <CommunityAvatar name={active.name} hue={active.iconHue} size={20} />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a] max-w-[140px] truncate">
              {active.name}
            </span>
          </>
        ) : (
          <>
            <span className="w-5 h-5 rounded-full border border-black/20 flex items-center justify-center">
              <Users2 className="w-2.5 h-2.5" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]">
              All makers
            </span>
          </>
        )}
        <ChevronDown className="w-3 h-3 text-black/40" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 left-0 min-w-[260px] bg-white border border-black/10 rounded-xl shadow-xl overflow-hidden slide-in">
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-black/[0.04] border-b border-black/[0.06]",
              activeId === null && "bg-black/[0.04]",
            )}
          >
            <span className="w-6 h-6 rounded-full border border-black/15 flex items-center justify-center">
              <Users2 className="w-3 h-3" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">All makers</div>
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/50">
                Public network · list prices
              </div>
            </div>
            {activeId === null ? (
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            ) : null}
          </button>
          {communities.length === 0 ? (
            <div className="p-4">
              <MonoLabel size="sm" className="block mb-2">
                No communities yet
              </MonoLabel>
              <Link
                href="/communities/new"
                className="text-sm font-medium text-[#0a0a0a] hover:underline"
              >
                Create your first →
              </Link>
            </div>
          ) : (
            communities.map((c) => {
              const active = c.id === activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-black/[0.04] border-b last:border-b-0 border-black/[0.06]",
                    active && "bg-black/[0.04]",
                  )}
                >
                  <CommunityAvatar name={c.name} hue={c.iconHue} size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {c.name}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/50 truncate">
                      {c.freeMode
                        ? "Free for members"
                        : c.discountPct > 0
                          ? `${c.discountPct}% off`
                          : "Community network"}
                      {" · "}
                      {c.makerCount}{" "}
                      {c.makerCount === 1 ? "maker" : "makers"}
                    </div>
                  </div>
                  {active ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : null}
                </button>
              );
            })
          )}
          <div className="px-3 py-2 border-t border-black/[0.06] bg-[#fafafa]">
            <Link
              href="/communities"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60 hover:text-black transition-colors"
            >
              Manage communities →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SortSelector({
  value,
  onChange,
  hasAnalysis,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
  hasAnalysis: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);

  const options: SortKey[] = [
    "nearest",
    "shortest-queue",
    "cheapest",
    "highest-rated",
    "most-compatible",
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 h-8 pl-3 pr-3 rounded-full border border-black/15 bg-white hover:bg-black/[0.04] transition-colors"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]">
          Sort · {SORT_LABELS[value]}
        </span>
        <ChevronDown className="w-3 h-3 text-black/40" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 left-0 min-w-[220px] bg-white border border-black/10 rounded-xl shadow-xl overflow-hidden slide-in">
          {options.map((k) => {
            const disabled = k === "most-compatible" && !hasAnalysis;
            return (
              <button
                key={k}
                onClick={() => {
                  if (disabled) return;
                  onChange(k);
                  setOpen(false);
                }}
                disabled={disabled}
                className={cn(
                  "w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-black/[0.04] border-b last:border-b-0 border-black/[0.06]",
                  value === k && "bg-black/[0.04]",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <span className="text-sm font-medium">{SORT_LABELS[k]}</span>
                {value === k ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                ) : disabled ? (
                  <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-black/40">
                    Upload first
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MakerRow({
  m,
  selected,
  community,
  hasAnalysis,
  onHover,
  onLeave,
  onClick,
}: {
  m: MakerScore;
  selected: boolean;
  community: CommunityForScope | null;
  hasAnalysis: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const incompatible =
    hasAnalysis &&
    (m.compatibility.fits === false ||
      m.compatibility.supportsMaterial === false ||
      m.compatibility.supportsMultiMaterialIfNeeded === false);

  const incompatibilityReason =
    m.compatibility.fits === false
      ? "Part exceeds build volume"
      : m.compatibility.supportsMaterial === false
        ? "Material not profiled"
        : m.compatibility.supportsMultiMaterialIfNeeded === false
          ? "No AMS — single colour only"
          : null;
  return (
    <li
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={cn(
        "px-5 py-4 flex items-start gap-4 cursor-pointer transition-colors",
        selected ? "bg-black/[0.04]" : "hover:bg-black/[0.02]",
        incompatible && "opacity-65",
      )}
    >
      <StatusDot
        tone={m.available ? "ready" : "printing"}
        pulse={m.available}
        className="mt-1.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold truncate flex items-center gap-1.5">
            {m.name}
            {m.supportsMultiMaterial ? (
              <span
                className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#0a0a0a] bg-black/[0.04] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                title="AMS / multi-material printer"
              >
                AMS
              </span>
            ) : null}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-black/70 whitespace-nowrap">
            {formatDistance(m.distanceKm)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 mt-0.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-black/50 truncate">
            {m.printer} · ⭐ {m.rating.toFixed(1)}
          </span>
          <span
            className={cn(
              "font-mono text-[9px] uppercase tracking-[0.18em] whitespace-nowrap",
              m.available ? "text-[#0a0a0a]" : "text-black/40",
            )}
          >
            {m.statusEta}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-black/50">
            <span>Queue · {m.queueMins} min</span>
            <span className="text-black/25">·</span>
            <span>{m.materials.join("/")}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
              from
            </span>
            <span className="font-mono text-[12px] font-bold tabular-nums">
              {community?.freeMode
                ? "Free"
                : formatGBP(m.indicativeGbp)}
            </span>
          </div>
        </div>
        {incompatibilityReason ? (
          <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#b45309]">
            {incompatibilityReason}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function RealMakerRow({
  m,
  isSelf,
}: {
  m: MakerProfileSummary;
  isSelf: boolean;
}) {
  const outwardCode = m.postcode
    ? m.postcode.split(/\s+/)[0]?.toUpperCase() ?? null
    : null;
  return (
    <li className="px-5 py-4 flex items-start gap-4 hover:bg-black/[0.02] transition-colors">
      <StatusDot
        tone={m.stripeOnboarded ? "ready" : "printing"}
        pulse={m.stripeOnboarded}
        className="mt-1.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold truncate flex items-center gap-1.5">
            <Link
              href={`/makers/${m.id}`}
              className="hover:underline underline-offset-2"
            >
              {m.displayName}
            </Link>
            {m.hasAMS ? (
              <span
                className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#0a0a0a] bg-black/[0.04] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                title="AMS / multi-material printer"
              >
                AMS
              </span>
            ) : null}
            {isSelf ? (
              <span
                className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#7c3aed] bg-[#7c3aed]/[0.08] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                title="This is your own maker profile"
              >
                You
              </span>
            ) : null}
          </span>
          {outwardCode ? (
            <span className="font-mono text-[11px] tabular-nums text-black/55 whitespace-nowrap">
              {outwardCode}
            </span>
          ) : null}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-black/50 truncate mt-0.5">
          {m.printerModel ?? "Printer not specified"}
          {m.materials.length > 0 ? ` · ${m.materials.join("/")}` : ""}
        </div>
        {!m.stripeOnboarded ? (
          <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#b45309]">
            Payouts not yet connected
          </div>
        ) : null}
      </div>
    </li>
  );
}

function EmptyMakers({ scope }: { scope: string | null }) {
  return (
    <li className="p-10 text-center">
      <MonoLabel size="md" className="mb-2 block">
        {scope ? "No makers in this community yet" : "No makers signed up yet"}
      </MonoLabel>
      <p className="text-sm font-light text-black/55 max-w-sm mx-auto leading-relaxed">
        {scope
          ? "The community owner hasn't affiliated any makers. Ask them to add some in Settings."
          : "Fabricate is brand new. Upload your file anyway — your job goes to the open market and any maker who joins can bid on it."}
      </p>
    </li>
  );
}

function LocationBadge({
  loc,
}: {
  loc: LocState;
  onRetry: () => void;
}) {
  const [showHelp, setShowHelp] = React.useState(false);

  if (loc.kind === "granted") {
    return (
      <div className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white">
        <StatusDot tone="ready" />
        <MonoLabel size="sm" className="!text-black">
          Located · sorted by distance
        </MonoLabel>
      </div>
    );
  }
  if (loc.kind === "pending") {
    return (
      <div className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white">
        <StatusDot tone="warn" pulse />
        <MonoLabel size="sm" className="!text-black">
          Finding you…
        </MonoLabel>
      </div>
    );
  }
  // Each error case wants slightly different guidance. We can't
  // programmatically re-prompt for permission once a browser has
  // remembered a "block" decision; the other failure modes need
  // OS-level or network-side fixes the user has to do themselves.
  const label =
    loc.kind === "denied"
      ? "Location off"
      : loc.kind === "timeout"
        ? "Location timed out"
        : loc.kind === "unavailable"
          ? "Location unavailable"
          : "Location unsupported";
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setShowHelp((v) => !v)}
        className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white hover:bg-black/[0.04] transition-colors"
      >
        <MapPin className="w-3 h-3 text-black/55" />
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/55">
          {label}
          <span className="text-black/30 ml-2">· tap for help</span>
        </span>
      </button>
      {showHelp ? (
        <div className="absolute right-0 top-9 z-[1100] w-72 rounded-xl border border-black/10 bg-white shadow-lg p-4 text-[12px] font-light leading-relaxed">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold text-black/55 mb-2">
            {loc.kind === "denied"
              ? "Re-enable location"
              : loc.kind === "timeout"
                ? "Couldn't get a fix"
                : "Location not available"}
          </div>
          {loc.kind === "denied" ? (
            <>
              <p className="text-black/70 mb-2">
                Browsers don&rsquo;t let us re-ask once you&rsquo;ve
                blocked permission. To switch it back on:
              </p>
              <ol className="list-decimal pl-4 text-black/65 space-y-1">
                <li>Click the lock icon in the URL bar.</li>
                <li>
                  <strong>Site settings</strong> →{" "}
                  <strong>Location</strong> → <strong>Allow</strong>.
                </li>
                <li>Reload this page.</li>
              </ol>
            </>
          ) : loc.kind === "timeout" ? (
            <p className="text-black/70 mb-2">
              The browser took too long to find your position. Reload
              the page or check your network. On desktop without GPS
              this can fail intermittently — a Wi-Fi connection
              usually fixes it.
            </p>
          ) : (
            <>
              <p className="text-black/70 mb-2">
                The browser says permission is on, but your operating
                system can&rsquo;t produce a position. On macOS:
              </p>
              <ol className="list-decimal pl-4 text-black/65 space-y-1">
                <li>
                  System Settings →{" "}
                  <strong>Privacy &amp; Security</strong> →{" "}
                  <strong>Location Services</strong>.
                </li>
                <li>
                  Make sure Location Services is on AND your browser
                  (Chrome / Safari / Edge) is in the allowed list.
                </li>
                <li>Reload this page.</li>
              </ol>
            </>
          )}
          <p className="mt-3 text-[11px] text-black/45">
            Without location the marketplace still works — distances
            and the map just won&rsquo;t centre on you.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div className="absolute inset-0 bg-[#f5f5f5] flex items-center justify-center">
      <MonoLabel size="md">Loading map…</MonoLabel>
    </div>
  );
}
