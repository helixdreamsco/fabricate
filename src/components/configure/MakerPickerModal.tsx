"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import {
  Check,
  ChevronDown,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { type Maker } from "@/lib/catalog";
import type { MakerProfileSummary } from "@/lib/maker-profile";
import { cn, formatDistance, formatGBP } from "@/lib/utils";
import { useOrder } from "@/lib/order-store";
import {
  SORT_LABELS,
  scoreMakers,
  sortMakers,
  type MakerScore,
  type SortKey,
} from "@/lib/maker-filters";

const FleetMap = dynamic(
  () => import("@/components/home/FleetMap").then((m) => m.FleetMap),
  { ssr: false, loading: () => <MapPlaceholder /> },
);

const FALLBACK_CENTER = { lat: 51.5074, lng: -0.1278 };

type Coord = { lat: number; lng: number };
type LocState =
  | { kind: "pending" }
  | { kind: "granted"; coord: Coord }
  | { kind: "denied" }
  | { kind: "unsupported" };

export function MakerPickerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { draft, set } = useOrder();
  const [loc, setLoc] = React.useState<LocState>({ kind: "pending" });
  const [sortKey, setSortKey] = React.useState<SortKey>("nearest");
  const [showFitting, setShowFitting] = React.useState(false);
  // Hover preview vs final pick. Final pick happens on row click.
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  // Re-geolocate when the modal opens (browser caches the permission so this
  // is cheap on subsequent opens).
  React.useEffect(() => {
    if (!open) return;
    if (!("geolocation" in navigator)) {
      setLoc({ kind: "unsupported" });
      return;
    }
    setLoc({ kind: "pending" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLoc({
          kind: "granted",
          coord: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        }),
      () => setLoc({ kind: "denied" }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, [open]);

  const referenceCoord: Coord =
    loc.kind === "granted" ? loc.coord : FALLBACK_CENTER;

  const [realMakers, setRealMakers] = React.useState<MakerProfileSummary[]>([]);

  // Pull real maker profiles from the DB whenever the modal opens. We
  // don't pass includeSelf — the creator picking who to prioritize for
  // their own job shouldn't see their own maker profile in the list.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/makers")
      .then((r) => (r.ok ? r.json() : { makers: [] }))
      .then((j: { makers?: MakerProfileSummary[] }) => {
        if (!cancelled) setRealMakers(j.makers ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Adapt MakerProfileSummary → Maker for the existing scoring/map UI.
  // Distance/queue/rating fields are stubbed since we don't yet track
  // those signals; lat/lng come from postcodes.io geocoding done
  // server-side in /api/makers.
  //
  // The list/scoring view wants one entry per maker (anchored on the
  // primary location's coords); the map wants one entry per pickup point
  // — see mapMakers below.
  const inScopeMakers: Maker[] = React.useMemo(() => {
    return realMakers.map((m): Maker => ({
      id: m.id,
      name: m.displayName,
      area: m.postcode ? m.postcode.split(/\s+/)[0]?.toUpperCase() ?? "" : "",
      postcode: m.postcode ?? "",
      printer: m.printerModel ?? "Printer not specified",
      statusEta: m.stripeOnboarded ? "Available" : "Setup pending",
      rating: 0,
      lat: m.lat ?? 0,
      lng: m.lng ?? 0,
      available: m.stripeOnboarded,
      materials: [],
      buildVolumeMm: { x: 256, y: 256, z: 256 },
      queueMins: 0,
      machineRateGbpPerHour: 0,
      supportsMultiMaterial: m.hasAMS,
    }));
  }, [realMakers]);

  // Map-only adaptation: one Maker per pickup location with lat/lng so a
  // multi-location maker shows up as multiple pins (sharing the same `id`
  // so clicking any pin still resolves to the maker). Falls back to the
  // profile-level coords for makers with no PickupLocation rows yet.
  const mapMakers: Maker[] = React.useMemo(() => {
    return realMakers.flatMap((m) => {
      const pins = (m.locations ?? []).filter(
        (l): l is typeof l & { lat: number; lng: number } =>
          l.lat != null && l.lng != null,
      );
      if (pins.length === 0 && m.lat != null && m.lng != null) {
        return [
          {
            id: m.id,
            pinId: m.id,
            name: m.displayName,
            area: m.postcode ? m.postcode.split(/\s+/)[0]?.toUpperCase() ?? "" : "",
            postcode: m.postcode ?? "",
            printer: m.printerModel ?? "Printer not specified",
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
          },
        ];
      }
      return pins.map((loc) => ({
        id: m.id,
        pinId: `${m.id}:${loc.id}`,
        name: m.displayName,
        area: loc.postcode,
        postcode: loc.postcode,
        printer: m.printerModel ?? "Printer not specified",
        statusEta: m.stripeOnboarded ? "Available" : "Setup pending",
        rating: 0,
        lat: loc.lat,
        lng: loc.lng,
        available: m.stripeOnboarded,
        materials: [],
        buildVolumeMm: { x: 256, y: 256, z: 256 },
        queueMins: 0,
        machineRateGbpPerHour: 0,
        supportsMultiMaterial: m.hasAMS,
      }));
    });
  }, [realMakers]);

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
        discountPct: draft.community?.discountPct ?? 0,
        freeMode: draft.community?.freeMode ?? false,
        needsMultiMaterial,
      }),
    [
      inScopeMakers,
      referenceCoord.lat,
      referenceCoord.lng,
      analysisLite,
      draft.material,
      draft.community?.discountPct,
      draft.community?.freeMode,
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

  const pick = (m: Maker) => {
    set({ maker: m });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a maker"
      subtitle="Browse · filter · pick"
      maxWidth="max-w-[1200px]"
    >
      {/* Toolbar */}
      <div className="px-8 py-4 border-b border-black/[0.06] flex items-center gap-3 flex-wrap">
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
              ? "Only show printers compatible with this part"
              : "Upload an STL to filter by compatibility"
          }
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
            Fits my part
          </span>
        </button>
        <LocationBadge loc={loc} onRetry={() => setLoc({ kind: "pending" })} />
        <div className="ml-auto">
          <MonoLabel size="sm">
            {visible.length} of {inScopeMakers.length} shown
          </MonoLabel>
        </div>
      </div>

      {/* Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] min-h-[60vh] max-h-[70vh]">
        {/* List */}
        <div className="overflow-y-auto border-r border-black/[0.06]">
          {visible.length === 0 ? (
            <div className="p-10 text-center">
              <MonoLabel size="md" className="mb-2 block">
                No makers match
              </MonoLabel>
              <p className="text-sm font-light text-black/55 max-w-sm mx-auto leading-relaxed">
                Try another sort or clear the &ldquo;Fits my part&rdquo;
                filter.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-black/[0.06]">
              {visible.map((m) => (
                <MakerRow
                  key={m.id}
                  m={m}
                  selected={draft.maker?.id === m.id}
                  preview={previewId === m.id}
                  hasAnalysis={!!draft.analysis}
                  onHover={() => setPreviewId(m.id)}
                  onLeave={() => setPreviewId(null)}
                  onPick={() => pick(m)}
                />
              ))}
            </ol>
          )}
        </div>

        {/* Map */}
        <div className="relative bg-white min-h-[40vh] lg:min-h-0">
          <FleetMap
            makers={mapMakers}
            user={loc.kind === "granted" ? loc.coord : null}
            selectedMakerId={previewId ?? draft.maker?.id ?? null}
            onSelect={(id) => setPreviewId(id)}
          />
        </div>
      </div>

      <div className="px-8 py-4 border-t border-black/[0.06] flex items-center justify-between gap-3">
        <MonoLabel size="sm">
          {draft.maker
            ? `Currently selected · ${draft.maker.name}`
            : "No maker selected — your job will go to the open market"}
        </MonoLabel>
        <Button variant="secondary" size="md" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────

function MakerRow({
  m,
  selected,
  preview,
  hasAnalysis,
  onHover,
  onLeave,
  onPick,
}: {
  m: MakerScore;
  selected: boolean;
  preview: boolean;
  hasAnalysis: boolean;
  onHover: () => void;
  onLeave: () => void;
  onPick: () => void;
}) {
  const incompatibilityReason =
    m.compatibility.fits === false
      ? "Part exceeds build volume"
      : m.compatibility.supportsMaterial === false
        ? "Material not profiled"
        : m.compatibility.supportsMultiMaterialIfNeeded === false
          ? "No AMS — single colour only"
          : null;
  const incompatible = hasAnalysis && incompatibilityReason !== null;

  return (
    <li
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onPick}
      className={cn(
        "px-5 py-4 flex items-start gap-4 cursor-pointer transition-colors",
        selected
          ? "bg-[#0a0a0a]/[0.04] ring-inset ring-1 ring-[#0a0a0a]/15"
          : preview
            ? "bg-black/[0.03]"
            : "hover:bg-black/[0.02]",
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
            {selected ? (
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            ) : null}
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
              {formatGBP(m.indicativeGbp)}
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

function LocationBadge({
  loc,
}: {
  loc: LocState;
  onRetry: () => void;
}) {
  if (loc.kind === "granted") {
    return (
      <div className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white">
        <StatusDot tone="ready" />
        <MonoLabel size="sm" className="!text-black">
          Located
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
  // Browsers can't be re-asked for permission once they've remembered a
  // block. Static badge — no retry button — to avoid the stuck-pending
  // bug we fixed on the homepage badge.
  return (
    <div className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white">
      <MapPin className="w-3 h-3 text-black/55" />
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/55">
        Location off · distances approx
      </span>
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
