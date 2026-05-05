"use client";
import * as React from "react";
import type { MeshAnalysis } from "./stl";
import type { MaterialKey, QualityKey, Maker } from "./catalog";
import { MATERIALS } from "./catalog";
import type { ServerAnalysis, ServerQuote } from "./api";

export type CommunityContext = {
  id: string;
  slug: string;
  name: string;
  iconHue: number;
  discountPct: number;
  freeMode: boolean;
  priorityQueue: boolean;
};

export type OrderDraft = {
  file: File | null;
  analysis: MeshAnalysis | null;
  serverAnalysis: ServerAnalysis | null;
  serverQuote: ServerQuote | null;
  quoteStatus: "idle" | "verifying" | "verified" | "error";
  quoteError: string | null;
  material: MaterialKey;
  /** Up to 9 alternative materials in priority order (after `material`).
   *  Maker can win the bid if their printer stocks any one of them. */
  materialAlternatives: MaterialKey[];
  /** Free-text "specific filament requirements" (brand, finish, etc.). */
  materialNotes: string;
  /** Hex per part — length matches `analysis.parts.length`. Single-mesh files have one entry. */
  partColors: string[];
  /** When false (default), the creator doesn't care what colour the
   *  maker prints in — saves a maker from being forced into a colour
   *  they don't stock. Toggle on /configure if a specific colour is
   *  required (e.g. matching an existing part). */
  colorMatters: boolean;
  quality: QualityKey;
  infill: number;
  quantity: number;
  delivery: "pickup" | "courier";
  /** Prioritized maker, if the creator picked one on /configure. Null
   *  unless explicitly selected — the static catalogue that used to
   *  seed this is gone now that real makers come from /api/makers. */
  maker: Maker | null;
  community: CommunityContext | null;
  /** User's geolocation — set from the home page's browser-geo prompt and
   *  reused on /configure for courier eligibility checks. */
  userCoord: { lat: number; lng: number } | null;
  notes: string;
};

const DEFAULT: OrderDraft = {
  file: null,
  analysis: null,
  serverAnalysis: null,
  serverQuote: null,
  quoteStatus: "idle",
  quoteError: null,
  material: "PLA",
  materialAlternatives: [],
  materialNotes: "",
  partColors: [MATERIALS[0].colors[0].hex],
  colorMatters: false,
  quality: "standard",
  infill: 20,
  quantity: 1,
  delivery: "pickup",
  maker: null,
  community: null,
  userCoord: null,
  notes: "",
};

/**
 * Pick a default colour palette for a freshly-uploaded part array — uses the
 * 3MF's source colour when present, otherwise rotates through a contrast
 * palette so multi-material previews are immediately distinguishable.
 */
const FALLBACK_PALETTE = [
  "#0a0a0a",
  "#ef4444",
  "#1d4ed8",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
];

export function defaultPartColors(
  analysis: MeshAnalysis,
  defaultMaterialColor: string,
): string[] {
  return analysis.parts.map((part, i) => {
    if (part.originalColorHex) return part.originalColorHex;
    if (analysis.parts.length === 1) return defaultMaterialColor;
    return FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
  });
}

type Ctx = {
  draft: OrderDraft;
  set: (patch: Partial<OrderDraft>) => void;
  reset: () => void;
};

const OrderContext = React.createContext<Ctx | null>(null);

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = React.useState<OrderDraft>(DEFAULT);
  const set = React.useCallback((patch: Partial<OrderDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);
  const reset = React.useCallback(() => setDraft(DEFAULT), []);
  const value = React.useMemo(() => ({ draft, set, reset }), [draft, set, reset]);
  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder() {
  const ctx = React.useContext(OrderContext);
  if (!ctx) throw new Error("useOrder must be used inside <OrderProvider>");
  return ctx;
}
