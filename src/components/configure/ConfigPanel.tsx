"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Stepper } from "@/components/ui/Stepper";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatGBP, formatDuration, cn } from "@/lib/utils";
import {
  DELIVERY_OPTIONS,
  MATERIALS,
  QUALITIES,
  type MaterialKey,
} from "@/lib/catalog";
import { estimateQuote } from "@/lib/pricing";
import { isPlatformFeePromoActive } from "@/lib/promotions";
import { useOrder } from "@/lib/order-store";
import { postQuote } from "@/lib/api";
import { MakerPickerModal } from "./MakerPickerModal";
import { CourierAvailability } from "./CourierAvailability";
import type { CourierQuote } from "@/lib/couriers";

export function ConfigPanel() {
  const router = useRouter();
  const { draft, set } = useOrder();
  const [pending, setPending] = React.useState(false);
  const [showInfillInfo, setShowInfillInfo] = React.useState(false);
  const [showMakerPicker, setShowMakerPicker] = React.useState(false);
  // Collapsible advanced sections — beginners shouldn't have to wade
  // through every knob. Sensible defaults are pre-selected; the
  // collapsed header shows the current selection so they can see what
  // they'd be getting without expanding.
  const [openMaterial, setOpenMaterial] = React.useState(false);
  const [openColor, setOpenColor] = React.useState(false);
  const [openQuality, setOpenQuality] = React.useState(false);
  const [openInfill, setOpenInfill] = React.useState(false);
  const [courierBest, setCourierBest] = React.useState<CourierQuote | null>(
    null,
  );
  const [locStatus, setLocStatus] = React.useState<
    "unknown" | "pending" | "granted" | "denied"
  >("unknown");

  // If the home page didn't capture geolocation (deep-link to /configure
  // straight from the dropzone), try once on mount so the courier widget can
  // resolve eligibility. Cheap when the permission's cached.
  React.useEffect(() => {
    if (draft.userCoord) {
      setLocStatus("granted");
      return;
    }
    if (!("geolocation" in navigator)) {
      setLocStatus("denied");
      return;
    }
    setLocStatus("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocStatus("granted");
        set({
          userCoord: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, [draft.userCoord, set]);

  const requestLocation = React.useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocStatus("denied");
      return;
    }
    setLocStatus("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocStatus("granted");
        set({
          userCoord: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }, [set]);

  // If user picked Courier but no provider is available, gently fall back to
  // pickup so we don't ship a £NaN line to the breakdown.
  React.useEffect(() => {
    if (
      draft.delivery === "courier" &&
      draft.userCoord &&
      courierBest === null
    ) {
      set({ delivery: "pickup" });
    }
  }, [draft.delivery, draft.userCoord, courierBest, set]);

  const material = MATERIALS.find((m) => m.key === draft.material)!;

  // Prefer server-validated volume when available — it corrects for non-
  // watertight meshes using convex-hull volume, which client-side parsing
  // doesn't handle.
  const volumeCm3 =
    draft.serverAnalysis?.volume_cm3 ??
    draft.analysis?.volumeCm3 ??
    0;

  // Distinct colours drive the AMS purge surcharge.
  const colorCount = React.useMemo(
    () => new Set(draft.partColors.map((c) => c.toLowerCase())).size || 1,
    [draft.partColors],
  );

  // Affiliate creator-waiver eligibility — referred user, first paid job
  // not yet captured. Fetched once; defaults to false (the safe value).
  const [creatorReferralEligible, setCreatorReferralEligible] =
    React.useState(false);
  React.useEffect(() => {
    void fetch("/api/affiliate/me")
      .then((r) => (r.ok ? r.json() : { eligible: false }))
      .then((j) => setCreatorReferralEligible(Boolean(j?.eligible)))
      .catch(() => setCreatorReferralEligible(false));
  }, []);

  // When courier is selected and we've got a live quote, swap the catalogue
  // £7.50 placeholder for the actual provider price.
  const deliveryFeeOverride =
    draft.delivery === "courier" && courierBest?.priceGbp != null
      ? courierBest.priceGbp
      : undefined;

  // Instant client-side estimate for responsiveness.
  const estimate = React.useMemo(() => {
    if (!draft.analysis) return null;
    return estimateQuote({
      volumeCm3,
      material: draft.material,
      quality: draft.quality,
      infillPct: draft.infill,
      quantity: draft.quantity,
      delivery: draft.delivery,
      discountPct: draft.community?.discountPct ?? 0,
      freeMode: draft.community?.freeMode ?? false,
      colorCount,
      deliveryFeeOverride,
      creatorReferralEligible,
    });
  }, [
    volumeCm3,
    draft.analysis,
    draft.material,
    draft.quality,
    draft.infill,
    draft.quantity,
    draft.delivery,
    draft.community?.discountPct,
    draft.community?.freeMode,
    colorCount,
    creatorReferralEligible,
    deliveryFeeOverride,
  ]);

  // Debounced server-verified quote. Cancels in-flight requests on config
  // change so we always land on the user's latest knobs.
  React.useEffect(() => {
    if (!draft.file) return;
    const ac = new AbortController();
    set({ quoteStatus: "verifying", quoteError: null });
    const t = setTimeout(async () => {
      try {
        const sq = await postQuote({
          file: draft.file!,
          material: draft.material,
          quality: draft.quality,
          infill: draft.infill,
          quantity: draft.quantity,
          delivery: draft.delivery,
          discountPct: draft.community?.discountPct ?? 0,
          freeMode: draft.community?.freeMode ?? false,
          colorCount,
          signal: ac.signal,
        });
        set({ serverQuote: sq, quoteStatus: "verified", quoteError: null });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        console.warn("server quote failed, keeping client estimate:", e);
        set({ quoteStatus: "error", quoteError: (e as Error).message });
      }
    }, 450);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [
    draft.file,
    draft.material,
    draft.quality,
    draft.infill,
    draft.quantity,
    draft.delivery,
    draft.community?.discountPct,
    draft.community?.freeMode,
    colorCount,
    set,
  ]);

  // Prefer the server quote total over the client estimate when it's fresh
  // (i.e. no pending verification). The server (Python) doesn't yet know
  // about the launch promo, free-mode waiver, or affiliate creator waiver
  // — so we apply all three client-side and adjust the total accordingly.
  const promoApplied = isPlatformFeePromoActive();
  const quote =
    draft.quoteStatus === "verified" && draft.serverQuote
      ? (() => {
          const sq = draft.serverQuote.quote;
          const freeJob = sq.subtotal === 0;
          const affiliateWaiverApplied =
            creatorReferralEligible && !freeJob && !promoApplied;
          const waiveFee = promoApplied || freeJob || affiliateWaiverApplied;
          return {
            weightG: sq.weight_g,
            estMinutes: sq.time_minutes,
            materialCost: sq.material_cost,
            machineCost: sq.machine_cost,
            serviceFee: waiveFee ? 0 : sq.service_fee,
            serviceFeeListPrice: sq.service_fee,
            promoApplied,
            affiliateWaiverApplied,
            freeJob,
            delivery: sq.delivery,
            subtotal: sq.subtotal,
            discountApplied: sq.discount_applied ?? 0,
            multiMaterialSurcharge: sq.multi_material_surcharge ?? 0,
            total: sq.total - (waiveFee ? sq.service_fee : 0),
            source: sq.engine,
          };
        })()
      : estimate
        ? {
            ...estimate,
            freeJob: estimate.subtotal === 0,
            source: "client estimate",
          }
        : null;

  const onMaterial = (key: MaterialKey) => {
    const m = MATERIALS.find((mm) => mm.key === key)!;
    // Switching material doesn't repaint already-coloured parts — only seeds
    // colours that haven't been chosen yet (e.g. picked from the legacy
    // single palette but unset by the user).
    set({ material: key });
    if (
      draft.partColors.length === 1 &&
      !draft.analysis?.parts[0]?.originalColorHex
    ) {
      set({ partColors: [m.colors[0].hex] });
    }
  };

  const setPartColor = (idx: number, hex: string) => {
    const next = [...draft.partColors];
    next[idx] = hex;
    set({ partColors: next });
  };

  const setAllPartColors = (hex: string) => {
    if (!draft.analysis) return;
    set({ partColors: draft.analysis.parts.map(() => hex) });
  };

  const onCheckout = () => {
    setPending(true);
    // Simulate a tiny latency — feels less instant (more "real").
    setTimeout(() => router.push("/checkout"), 280);
  };

  if (!draft.analysis || !quote) return null;

  return (
    <aside className="w-full lg:w-[440px] lg:shrink-0 border-l border-black/[0.08] bg-white h-full overflow-y-auto bg-grid-none">
      <div className="flex flex-col">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b border-black/[0.06] px-6 py-4">
          <div className="flex items-center justify-between">
            <MonoLabel size="md" className="!text-black">
              Configure
            </MonoLabel>
            <div className="inline-flex items-center gap-1.5">
              <StatusDot
                tone={
                  draft.quoteStatus === "verifying"
                    ? "warn"
                    : draft.quoteStatus === "verified"
                      ? "ready"
                      : draft.quoteStatus === "error"
                        ? "offline"
                        : "neutral"
                }
                pulse={draft.quoteStatus === "verifying"}
              />
              <MonoLabel size="sm">
                {draft.quoteStatus === "verifying"
                  ? "Verifying…"
                  : draft.quoteStatus === "verified"
                    ? "Server-verified"
                    : draft.quoteStatus === "error"
                      ? "Client estimate only"
                      : "Live quote"}
              </MonoLabel>
            </div>
          </div>
        </div>

        {/* Community context badge */}
        {draft.community ? (
          <div className="mx-6 mt-5 mb-1 rounded-xl border border-[#0a0a0a] bg-[#0a0a0a] text-white px-4 py-3 flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg shrink-0 ring-1 ring-white/15"
              style={{
                background: `linear-gradient(135deg, hsl(${draft.community.iconHue} 80% 86%) 0%, hsl(${
                  (draft.community.iconHue + 40) % 360
                } 70% 74%) 100%)`,
              }}
            />
            <div className="flex flex-col gap-0.5 flex-1">
              <span className="text-[12px] font-bold">
                Ordering as {draft.community.name}
              </span>
              <span className="text-[11px] font-light text-white/65 leading-snug">
                {draft.community.freeMode
                  ? "Free prints for community members."
                  : draft.community.discountPct > 0
                    ? `${draft.community.discountPct}% community discount applied.`
                    : "Community access · no discount set."}
                {draft.community.priorityQueue ? " Priority queue." : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={() => set({ community: null })}
              className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/50 hover:text-white transition-colors"
              title="Place as a regular order instead"
            >
              Drop
            </button>
          </div>
        ) : null}

        {/* Watertight warning from server analysis */}
        {draft.serverAnalysis &&
        (!draft.serverAnalysis.is_watertight ||
          draft.serverAnalysis.used_convex_hull) ? (
          <div className="mx-6 mt-5 mb-1 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/[0.08] px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[#b45309] mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[#7c2d12]">
                Mesh is not watertight
              </span>
              <span className="text-[11px] font-light text-black/65 leading-snug">
                We&rsquo;ve priced from the convex-hull volume — you may pay
                slightly more than necessary. Repair in your CAD tool for a
                tighter quote.
              </span>
            </div>
          </div>
        ) : null}

        {/* Material */}
        <section className="border-b border-black/[0.06]">
          <SectionHeader
            label="Material"
            summary={
              draft.materialAlternatives.length > 0
                ? `${material.label} +${draft.materialAlternatives.length}`
                : material.label
            }
            detail={
              draft.materialAlternatives.length > 0
                ? "Ranked preferences"
                : material.tagline
            }
            open={openMaterial}
            onToggle={() => setOpenMaterial((v) => !v)}
          />
          {openMaterial ? (
            <div className="px-6 pb-6 space-y-4">
              <MonoLabel size="sm" className="block">
                Pricing uses your top pick: {material.densityGPerCm3.toFixed(2)} g/cm³ ·{" "}
                {formatGBP(material.pricePerGramGbp)}/g
              </MonoLabel>
              <MaterialPriorityList
                primary={draft.material}
                alternatives={draft.materialAlternatives}
                onPrimaryChange={onMaterial}
                onAlternativesChange={(alts) =>
                  set({ materialAlternatives: alts })
                }
              />
              <div>
                <MonoLabel size="sm" className="block mb-2">
                  Specific filament requirements{" "}
                  <span className="!text-black/35 normal-case tracking-normal font-light">
                    (optional)
                  </span>
                </MonoLabel>
                <textarea
                  value={draft.materialNotes}
                  onChange={(e) =>
                    set({ materialNotes: e.target.value.slice(0, 500) })
                  }
                  placeholder="e.g. Matte finish; Bambu PLA Basic in any earth tone; avoid recycled."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-black/[0.10] bg-white text-sm font-light placeholder:text-black/35 focus:border-black/40 focus:outline-none resize-y"
                />
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/35 mt-1 text-right">
                  {draft.materialNotes.length}/500
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* Color — single picker for single-mesh files, per-part for 3MF
            multi-material */}
        {draft.analysis.isMultiMaterial ? (
          <section className="border-b border-black/[0.06]">
            <SectionHeader
              label="Colours"
              summary={
                draft.colorMatters
                  ? `${draft.analysis.parts.length} parts`
                  : "Maker chooses"
              }
              detail={draft.colorMatters ? "Multi-material" : "Any colour OK"}
              open={openColor}
              onToggle={() => setOpenColor((v) => !v)}
            />
            {openColor ? (
              <div className="px-6 pb-6">
            <ColorMattersToggle
              value={draft.colorMatters}
              onChange={(v) => set({ colorMatters: v })}
            />
            {!draft.colorMatters ? null : (
            <>
            <div className="flex flex-col gap-3">
              {draft.analysis.parts.map((part, i) => {
                const current = draft.partColors[i] ?? "#0a0a0a";
                return (
                  <div
                    key={part.geometry.uuid}
                    className="rounded-xl border border-black/[0.08] p-3 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-7 h-7 rounded-full ring-1 ring-black/15 shrink-0"
                        style={{ background: current }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {part.name}
                        </div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45">
                          {part.volumeCm3.toFixed(2)} cm³ ·{" "}
                          {part.triangleCount.toLocaleString("en-GB")} tris
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {material.colors.map((c) => {
                        const active = c.hex.toLowerCase() === current.toLowerCase();
                        return (
                          <button
                            key={c.hex}
                            onClick={() => setPartColor(i, c.hex)}
                            title={c.name}
                            className={cn(
                              "relative w-7 h-7 rounded-full transition-all",
                              active
                                ? "ring-2 ring-offset-1 ring-[#0a0a0a]"
                                : "ring-1 ring-black/10 hover:ring-black/40",
                            )}
                            style={{ background: c.hex }}
                            aria-label={`${part.name}: ${c.name}`}
                          />
                        );
                      })}
                      <CustomColorPicker
                        value={current}
                        onChange={(hex) => setPartColor(i, hex)}
                        size={28}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <MonoLabel size="sm">
                Each colour change adds a small purge surcharge.
              </MonoLabel>
              <button
                type="button"
                onClick={() =>
                  setAllPartColors(
                    draft.partColors[0] ?? material.colors[0].hex,
                  )
                }
                className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/55 hover:text-black transition-colors"
              >
                Apply first to all →
              </button>
            </div>
            </>
            )}
              </div>
            ) : null}
          </section>
        ) : (
          <section className="border-b border-black/[0.06]">
            <SectionHeader
              label="Colour"
              summary={
                draft.colorMatters
                  ? material.colors.find(
                      (c) => c.hex === (draft.partColors[0] ?? ""),
                    )?.name ?? "Custom"
                  : "Maker chooses"
              }
              detail={draft.colorMatters ? undefined : "Any colour OK"}
              swatch={
                draft.colorMatters
                  ? draft.partColors[0] ?? material.colors[0].hex
                  : undefined
              }
              open={openColor}
              onToggle={() => setOpenColor((v) => !v)}
            />
            {openColor ? (
              <div className="px-6 pb-6">
            <ColorMattersToggle
              value={draft.colorMatters}
              onChange={(v) => set({ colorMatters: v })}
            />
            {!draft.colorMatters ? null : (
            <div className="flex flex-wrap gap-2.5 items-center">
              {material.colors.map((c) => {
                const active = c.hex === (draft.partColors[0] ?? "");
                return (
                  <button
                    key={c.hex}
                    onClick={() => setPartColor(0, c.hex)}
                    title={c.name}
                    className={cn(
                      "relative w-9 h-9 rounded-full transition-all",
                      active
                        ? "ring-2 ring-offset-2 ring-[#0a0a0a]"
                        : "ring-1 ring-black/10 hover:ring-black/40",
                    )}
                    style={{ background: c.hex }}
                    aria-label={c.name}
                  />
                );
              })}
              <CustomColorPicker
                value={draft.partColors[0] ?? "#0a0a0a"}
                onChange={(hex) => setPartColor(0, hex)}
                size={36}
              />
            </div>
            )}
              </div>
            ) : null}
          </section>
        )}

        {/* Quality */}
        <section className="border-b border-black/[0.06]">
          <SectionHeader
            label="Quality"
            summary={QUALITIES.find((q) => q.key === draft.quality)!.label}
            detail={`${QUALITIES.find((q) => q.key === draft.quality)!.layerMm.toFixed(2)} mm layers`}
            open={openQuality}
            onToggle={() => setOpenQuality((v) => !v)}
          />
          {openQuality ? (
            <div className="px-6 pb-6">
          <SegmentedControl
            value={draft.quality}
            onChange={(v) => set({ quality: v })}
            options={QUALITIES.map((q) => ({ value: q.key, label: q.label }))}
          />
            </div>
          ) : null}
        </section>

        {/* Infill */}
        <section className="border-b border-black/[0.06]">
          <SectionHeader
            label="Infill"
            summary={`${draft.infill}%`}
            detail={
              draft.infill <= 15
                ? "Light · decorative"
                : draft.infill <= 30
                  ? "Standard"
                  : "Dense · functional"
            }
            open={openInfill}
            onToggle={() => setOpenInfill((v) => !v)}
          />
          {openInfill ? (
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setShowInfillInfo((s) => !s)}
                  aria-label="What is infill?"
                  aria-expanded={showInfillInfo}
                  className={cn(
                    "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
                    showInfillInfo
                      ? "text-[#0a0a0a]"
                      : "text-black/55 hover:text-black",
                  )}
                >
                  <span className="w-4 h-4 rounded-full bg-black/[0.06] flex items-center justify-center text-[9px] font-bold">
                    i
                  </span>
                  What is infill?
                </button>
                <span className="font-mono text-sm font-bold tabular-nums">
                  {draft.infill}%
                </span>
              </div>
          {showInfillInfo ? (
            <div className="mb-4 rounded-xl bg-black/[0.03] border border-black/[0.06] px-4 py-3 text-[12px] font-light text-black/70 leading-relaxed slide-in">
              <p>
                The hollow lattice printed inside the part. Walls are always
                solid; the interior is a sparse pattern at the % you choose.
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-[11px]">
                <li>
                  <span className="font-mono text-black/60">10–15%</span>{" "}
                  · decorative pieces, models you won&rsquo;t handle.
                </li>
                <li>
                  <span className="font-mono text-black/60">20%</span> ·
                  default — fine for prototypes, casings, bins.
                </li>
                <li>
                  <span className="font-mono text-black/60">50–80%</span>{" "}
                  · functional parts under load — brackets, hinges,
                  doorstops.
                </li>
                <li>
                  <span className="font-mono text-black/60">100%</span> ·
                  fully solid — heavy, slow, very strong.
                </li>
              </ul>
              <p className="mt-2 text-[11px] text-black/55">
                Higher infill = stronger and heavier, but more filament and a
                longer print, so the price moves with the slider.
              </p>
            </div>
          ) : null}
          <input
            type="range"
            className="thin"
            min={10}
            max={100}
            step={5}
            value={draft.infill}
            onChange={(e) => set({ infill: Number(e.target.value) })}
          />
          <div className="flex justify-between mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-black/35">
            <span>10% · light</span>
            <span>20% · default</span>
            <span>100% · solid</span>
          </div>
            </div>
          ) : null}
        </section>

        {/* Quantity */}
        <section className="px-6 py-6 border-b border-black/[0.06]">
          <div className="flex items-center justify-between">
            <MonoLabel size="md">Quantity</MonoLabel>
            <Stepper
              value={draft.quantity}
              onChange={(v) => set({ quantity: v })}
              min={1}
              max={50}
            />
          </div>
        </section>

        {/* Delivery */}
        <section className="px-6 py-6 border-b border-black/[0.06]">
          <MonoLabel size="md" className="mb-3 block">
            Delivery
          </MonoLabel>
          <div className="grid grid-cols-1 gap-2">
            {DELIVERY_OPTIONS.map((d) => {
              const active = d.key === draft.delivery;
              const isCourier = d.key === "courier";
              // Courier is disabled at launch — no real provider integrations
              // wired yet. Render the row but make it unselectable with a
              // "Coming soon" subtitle so makers/creators see it's planned.
              const disabled = isCourier;
              return (
                <button
                  key={d.key}
                  onClick={() => {
                    if (!disabled) set({ delivery: d.key });
                  }}
                  disabled={disabled}
                  className={cn(
                    "text-left px-4 py-3 rounded-xl border flex items-center justify-between transition-all",
                    active
                      ? "border-[#0a0a0a] bg-[#0a0a0a] text-white"
                      : "border-black/10 hover:border-black/30 bg-white",
                    disabled &&
                      "opacity-50 cursor-not-allowed hover:border-black/10",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{d.label}</span>
                    <span
                      className={cn(
                        "text-[11px] font-light mt-0.5",
                        active ? "text-white/70" : "text-black/55",
                      )}
                    >
                      {isCourier ? "Coming soon" : d.eta}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      active ? "text-white" : "text-black",
                    )}
                  >
                    {isCourier
                      ? "—"
                      : d.priceGbp === 0
                        ? "Free"
                        : formatGBP(d.priceGbp)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Courier coverage panel — always visible when courier is the
              chosen delivery, so users can see who can actually ship and at
              what price before paying. */}
          {draft.delivery === "courier" && draft.maker ? (
            <div className="mt-3">
              <CourierAvailability
                pickup={{ lat: draft.maker.lat, lng: draft.maker.lng }}
                drop={draft.userCoord}
                locationStatus={locStatus}
                onRequestLocation={requestLocation}
                onBestQuote={setCourierBest}
              />
            </div>
          ) : null}
        </section>

        {/* Maker */}
        <section className="px-6 py-6 border-b border-black/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <MonoLabel size="md">Maker</MonoLabel>
            <button
              type="button"
              onClick={() => setShowMakerPicker(true)}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black transition-colors"
            >
              Browse all →
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowMakerPicker(true)}
            className="w-full text-left px-4 py-3 rounded-xl border border-black/10 hover:border-black/30 bg-white flex items-center justify-between transition-colors"
          >
            {draft.maker ? (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate flex items-center gap-1.5">
                  {draft.maker.name}
                  {draft.maker.supportsMultiMaterial ? (
                    <span
                      className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#0a0a0a] bg-black/[0.04] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                      title="AMS / multi-material printer"
                    >
                      AMS
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-light text-black/55 mt-0.5 truncate">
                  {draft.maker.printer} · {draft.maker.area} ·{" "}
                  {draft.maker.statusEta}
                </span>
              </div>
            ) : (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium">No maker prioritized</span>
                <span className="text-[11px] font-light text-black/55 mt-0.5">
                  Your job will go to the open market — any verified maker can bid.
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0">
              {draft.maker ? (
                <StatusDot
                  tone={draft.maker.available ? "ready" : "printing"}
                  pulse={draft.maker.available}
                />
              ) : null}
              <ChevronDown className="w-4 h-4 text-black/40" />
            </div>
          </button>
          {draft.analysis?.isMultiMaterial &&
          draft.maker &&
          !draft.maker.supportsMultiMaterial ? (
            <div className="mt-2 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/[0.08] px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-[#b45309] mt-0.5 shrink-0" />
              <span className="text-[11px] font-light text-[#7c2d12] leading-snug">
                This maker has no AMS — your file is multi-material. Pick an
                AMS-equipped maker to keep all colours, or accept a
                single-colour print.
              </span>
            </div>
          ) : null}
        </section>

        {/* Price breakdown */}
        <section className="px-6 py-6 border-b border-black/[0.06]">
          <MonoLabel size="md" className="mb-4 block">
            Breakdown
          </MonoLabel>
          <div className="flex flex-col gap-2 font-mono text-[13px] tabular-nums">
            <Row
              label="Material"
              detail={`${quote.weightG.toFixed(1)} g · ${material.label}`}
              value={formatGBP(quote.materialCost)}
            />
            <Row
              label="Machine time"
              detail={formatDuration(quote.estMinutes / 60)}
              value={formatGBP(quote.machineCost)}
            />
            {quote.freeJob ? null : (
              <Row
                label="Service"
                detail={
                  quote.promoApplied
                    ? "Waived · launch promo"
                    : quote.affiliateWaiverApplied
                      ? "Waived · affiliate code"
                      : "QC + escrow"
                }
                value={
                  quote.promoApplied ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="text-black/35 line-through font-light">
                        {formatGBP(quote.serviceFeeListPrice)}
                      </span>
                      <span className="text-[#7c3aed] font-bold">£0.00</span>
                    </span>
                  ) : quote.affiliateWaiverApplied ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="text-black/35 line-through font-light">
                        {formatGBP(quote.serviceFeeListPrice)}
                      </span>
                      <span className="text-emerald-700 font-bold">£0.00</span>
                    </span>
                  ) : (
                    formatGBP(quote.serviceFee)
                  )
                }
              />
            )}
            <Row
              label="Delivery"
              detail={
                DELIVERY_OPTIONS.find((d) => d.key === draft.delivery)?.eta ??
                ""
              }
              value={
                quote.delivery === 0 ? "Free" : formatGBP(quote.delivery)
              }
            />
            {"discountApplied" in quote && quote.discountApplied > 0.005 ? (
              <div className="flex items-baseline justify-between text-[#065f46]">
                <div className="flex flex-col">
                  <span>Community saving</span>
                  {draft.community ? (
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[#065f46]/70">
                      {draft.community.name}
                      {draft.community.freeMode
                        ? " · free mode"
                        : ` · ${draft.community.discountPct}% off`}
                    </span>
                  ) : null}
                </div>
                <span>−{formatGBP(quote.discountApplied)}</span>
              </div>
            ) : null}
            {"multiMaterialSurcharge" in quote &&
            quote.multiMaterialSurcharge > 0.005 ? (
              <Row
                label="Multi-material surcharge"
                detail={`${colorCount} colours · purge / waste tower`}
                value={`+${formatGBP(quote.multiMaterialSurcharge)}`}
              />
            ) : null}
            <div className="mt-3 pt-3 border-t border-black/[0.08] flex items-end justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/40">
                  Total
                </span>
                <span className="font-black tracking-tight text-3xl tabular-nums mt-0.5 font-sans">
                  {formatGBP(quote.total)}
                </span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 pb-1 text-right">
                engine · {quote.source}
              </span>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-6 bg-[#fafafa]">
          <Button
            size="xl"
            withArrow
            onClick={onCheckout}
            disabled={pending}
            className="w-full justify-between"
          >
            {pending ? "Preparing checkout…" : `Checkout · ${formatGBP(quote.total)}`}
          </Button>
          <div className="mt-3 flex items-center justify-center gap-2">
            <StatusDot tone="ready" />
            <MonoLabel size="sm">
              Secure · Stripe · Escrow until pickup
            </MonoLabel>
          </div>
        </section>
      </div>
      <MakerPickerModal
        open={showMakerPicker}
        onClose={() => setShowMakerPicker(false)}
      />
    </aside>
  );
}

function Row({
  label,
  detail,
  value,
}: {
  label: string;
  detail?: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="flex flex-col">
        <span className="text-black">{label}</span>
        {detail ? (
          <span className="text-[10px] uppercase tracking-[0.15em] text-black/40">
            {detail}
          </span>
        ) : null}
      </div>
      <span className="text-black">{value}</span>
    </div>
  );
}

function CustomColorPicker({
  value,
  onChange,
  size,
}: {
  value: string;
  onChange: (hex: string) => void;
  size: number;
}) {
  // Native <input type="color"> opens the OS colour wheel — no extra
  // library needed. We hide the input itself and surface a styled label
  // showing a rainbow swatch as the affordance.
  const id = React.useId();
  return (
    <label
      htmlFor={id}
      title="Pick a custom colour"
      className="relative rounded-full ring-1 ring-black/10 hover:ring-black/40 transition-all cursor-pointer flex items-center justify-center text-[9px] font-mono uppercase tracking-[0.18em] text-white"
      style={{
        width: size,
        height: size,
        background:
          "conic-gradient(from 90deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
      }}
    >
      <span
        className="absolute inset-1 rounded-full"
        style={{ background: value }}
      />
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </label>
  );
}

function MaterialPriorityList({
  primary,
  alternatives,
  onPrimaryChange,
  onAlternativesChange,
}: {
  primary: MaterialKey;
  alternatives: MaterialKey[];
  /** Called when the top-of-list (primary) item changes — wraps the
   *  partColors-seeding side effect. */
  onPrimaryChange: (key: MaterialKey) => void;
  onAlternativesChange: (next: MaterialKey[]) => void;
}) {
  const list: MaterialKey[] = [primary, ...alternatives];

  const apply = (next: MaterialKey[]) => {
    if (next.length === 0) return;
    if (next[0] !== primary) onPrimaryChange(next[0]);
    onAlternativesChange(next.slice(1));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length) return;
    const next = list.slice();
    [next[from], next[to]] = [next[to], next[from]];
    apply(next);
  };

  const remove = (i: number) => {
    if (list.length <= 1) return;
    apply(list.filter((_, idx) => idx !== i));
  };

  const add = (key: MaterialKey) => {
    if (list.includes(key) || list.length >= 10) return;
    apply([...list, key]);
  };

  const available = MATERIALS.filter(
    (m) => !list.includes(m.key as MaterialKey),
  );

  return (
    <div className="space-y-2">
      {list.map((key, i) => {
        const m = MATERIALS.find((x) => x.key === key);
        if (!m) return null;
        const isFirst = i === 0;
        const isLast = i === list.length - 1;
        return (
          <div
            key={`${key}-${i}`}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-black/[0.10] bg-white"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 w-5 text-right">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2">
                {m.label}
                {isFirst ? (
                  <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#7c3aed] bg-[#7c3aed]/[0.08] px-1.5 py-0.5 rounded-full">
                    Top pick
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] font-light text-black/55 truncate">
                {m.tagline}
              </div>
            </div>
            <button
              type="button"
              onClick={() => move(i, i - 1)}
              disabled={isFirst}
              aria-label="Move up"
              className="w-7 h-7 rounded-md flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.04] disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, i + 1)}
              disabled={isLast}
              aria-label="Move down"
              className="w-7 h-7 rounded-md flex items-center justify-center text-black/55 hover:text-black hover:bg-black/[0.04] disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={list.length <= 1}
              aria-label="Remove"
              className="w-7 h-7 rounded-md flex items-center justify-center text-black/55 hover:text-red-600 hover:bg-red-50 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
            >
              ×
            </button>
          </div>
        );
      })}
      {available.length > 0 && list.length < 10 ? (
        <div className="pt-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mb-2">
            Add a fallback material
          </div>
          <div className="flex flex-wrap gap-2">
            {available.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => add(m.key as MaterialKey)}
                className="px-3 py-1.5 rounded-full border border-dashed border-black/15 hover:border-black/40 hover:bg-black/[0.02] transition-colors font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                + {m.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ColorMattersToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-black/[0.08] bg-black/[0.02] p-3">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Colour matters</div>
          <div className="text-[12px] font-light text-black/55 mt-0.5 leading-snug">
            {value
              ? "Pick the exact colour(s) you want — your maker will match."
              : "Maker prints in any colour they have in stock. More makers can take the job and you can save on a bespoke filament order."}
          </div>
        </div>
      </label>
    </div>
  );
}

function SectionHeader({
  label,
  summary,
  detail,
  swatch,
  open,
  onToggle,
}: {
  /** Mono uppercase header (e.g. "Material"). */
  label: string;
  /** Bold body-size value of the current pick (e.g. "PLA"). */
  summary: string;
  /** Quiet secondary line under the summary (e.g. "Easy & affordable"). */
  detail?: string;
  /** Optional colour swatch shown left of the summary. */
  swatch?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full px-6 py-5 flex items-center justify-between gap-4 hover:bg-black/[0.02] transition-colors text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        {swatch ? (
          <span
            className="w-7 h-7 rounded-full ring-1 ring-black/15 shrink-0"
            style={{ background: swatch }}
          />
        ) : null}
        <div className="flex flex-col min-w-0">
          <MonoLabel size="sm" className="!text-black/55">
            {label}
          </MonoLabel>
          <span className="text-sm font-semibold truncate">
            {summary}
            {detail ? (
              <span className="ml-2 font-light text-black/55">· {detail}</span>
            ) : null}
          </span>
        </div>
      </div>
      <ChevronDown
        className={cn(
          "w-4 h-4 text-black/40 transition-transform shrink-0",
          open && "rotate-180",
        )}
      />
    </button>
  );
}

