"use client";
import * as React from "react";
import { Check, MapPin, X, RefreshCw, Truck } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { cn, formatDistance, formatGBP } from "@/lib/utils";
import {
  COURIERS,
  bestCourierQuote,
  quoteAllCouriers,
  reasonCopy,
  type CourierQuote,
} from "@/lib/couriers";

type Coord = { lat: number; lng: number };

type Props = {
  pickup: Coord;
  drop: Coord | null;
  /** Called when the user retries / requests location permission. */
  onRequestLocation?: () => void;
  locationStatus: "unknown" | "pending" | "granted" | "denied";
  /** Called every time we (re)compute the best price so the parent can pass
   *  it to the pricing engine. Null when no provider is available. */
  onBestQuote?: (q: CourierQuote | null) => void;
};

export function CourierAvailability({
  pickup,
  drop,
  onRequestLocation,
  locationStatus,
  onBestQuote,
}: Props) {
  const [expanded, setExpanded] = React.useState(false);

  const allQuotes = React.useMemo(
    () => (drop ? quoteAllCouriers(pickup, drop) : []),
    [pickup, drop],
  );
  const best = React.useMemo(
    () => (drop ? bestCourierQuote(pickup, drop) : null),
    [pickup, drop],
  );

  React.useEffect(() => {
    onBestQuote?.(best);
  }, [best, onBestQuote]);

  if (!drop) {
    return (
      <div className="rounded-xl border border-black/10 bg-[#fafafa] px-4 py-3 flex items-start gap-3">
        <MapPin className="w-4 h-4 text-black/45 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="text-[12px] font-bold text-black">
            {locationStatus === "pending"
              ? "Checking your location…"
              : "Need your location to check courier coverage"}
          </div>
          <p className="text-[11px] font-light text-black/55 mt-0.5 leading-snug">
            We compare Stuart, Uber Direct and Gophr against your address and
            the maker&rsquo;s address.
          </p>
          {locationStatus !== "pending" ? (
            <button
              type="button"
              onClick={onRequestLocation}
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a] hover:underline"
            >
              <RefreshCw className="w-3 h-3" />
              Allow location
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!best) {
    return (
      <div className="rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/[0.08] px-4 py-3 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <X className="w-4 h-4 text-[#b45309] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[12px] font-bold text-[#7c2d12]">
              Courier not available for this route
            </div>
            <p className="text-[11px] font-light text-black/65 mt-0.5 leading-snug">
              None of our integrated couriers ({COURIERS.map((c) => c.name).join(", ")})
              can pick up at {pickup.lat.toFixed(2)},{pickup.lng.toFixed(2)}
              {" "}and drop at {drop.lat.toFixed(2)},{drop.lng.toFixed(2)}. Use
              pickup instead, or try a maker closer to you.
            </p>
          </div>
        </div>
        <details className="group">
          <summary className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/55 cursor-pointer hover:text-black transition-colors">
            Why? · per-provider check
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 pl-1">
            {allQuotes.map((q) => (
              <li
                key={q.provider.id}
                className="flex items-center gap-2 text-[11px] font-light text-black/65"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: q.provider.brandColor }}
                />
                <span className="font-medium text-black/80 w-24">
                  {q.provider.name}
                </span>
                <span className="text-black/55">{reasonCopy(q.reason)}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#10b981]/30 bg-[#10b981]/[0.06] px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <Truck className="w-4 h-4 text-[#065f46] mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-bold text-[#065f46]">
              Via {best.provider.name}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-[#065f46]">
              {formatGBP(best.priceGbp ?? 0)}
            </span>
          </div>
          <p className="text-[11px] font-light text-black/60 mt-0.5">
            ~{best.etaMin} min · {formatDistance(best.routeKm)} route ·{" "}
            <span className="font-mono text-black/45">
              {best.provider.status === "stub"
                ? "stub integration"
                : "live"}
            </span>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className="self-start font-mono text-[9px] uppercase tracking-[0.18em] text-black/55 hover:text-black transition-colors"
      >
        {expanded ? "Hide" : "Compare"} all couriers
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-2 pt-2 border-t border-[#10b981]/20">
          {allQuotes.map((q) => {
            const isBest = q.provider.id === best.provider.id;
            return (
              <li
                key={q.provider.id}
                className={cn(
                  "flex items-center gap-3 px-2 py-1.5 rounded-lg",
                  isBest && "bg-white/60",
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: q.provider.brandColor }}
                />
                <span className="text-[12px] font-medium flex-1 flex items-center gap-1.5">
                  {q.provider.name}
                  {isBest ? (
                    <Check className="w-3 h-3" strokeWidth={3} />
                  ) : null}
                </span>
                {q.available ? (
                  <span className="font-mono text-[11px] tabular-nums text-black/75">
                    {formatGBP(q.priceGbp ?? 0)} · {q.etaMin} min
                  </span>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-black/40">
                    {reasonCopy(q.reason)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
