export type MaterialKey = "PLA" | "PETG" | "ABS" | "TPU";

/**
 * Filament densities (g/cm³). The single source of truth — `MATERIALS`
 * below reads from here, as does the Python quote service via the request
 * payload.
 *
 * ASA is listed but not orderable: makers profile for it and it shows up in
 * printer capability filters, so the density is worth having in one place
 * for when it graduates to a `MATERIALS` entry.
 */
export const MATERIAL_DENSITY_G_PER_CM3 = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
  ASA: 1.07,
  TPU: 1.21,
} as const;

/**
 * Platform default filament rates (£/g).
 *
 * These are cost-of-goods rates — spool price plus handling and failed-print
 * allowance — NOT a margin vehicle. Platform take lives in the subtotal
 * margin and the service fee. The previous £0.085/g for PLA (~£85/kg, about
 * 4× spool cost) was quietly carrying margin in the material line, which
 * made the breakdown lie about what the plastic costs.
 *
 * Makers will set their own rates; `estimateFilamentGrams` and
 * `materialCostGbp` take the rate as an argument so a maker rate drops in
 * without touching the maths.
 */
export const MATERIAL_RATE_GBP_PER_GRAM = {
  PLA: 0.045,
  PETG: 0.058,
  ABS: 0.064,
  TPU: 0.095,
} as const satisfies Record<MaterialKey, number>;

export type Material = {
  key: MaterialKey;
  label: string;
  tagline: string;
  densityGPerCm3: number;
  pricePerGramGbp: number;
  colors: Array<{ name: string; hex: string }>;
  badge?: string;
};

export const MATERIALS: Material[] = [
  {
    key: "PLA",
    label: "PLA",
    tagline: "Default. Rigid, biodegradable, great finish.",
    densityGPerCm3: MATERIAL_DENSITY_G_PER_CM3.PLA,
    pricePerGramGbp: MATERIAL_RATE_GBP_PER_GRAM.PLA,
    badge: "Most popular",
    colors: [
      { name: "Fabricate purple", hex: "#7c3aed" },
      { name: "Obsidian", hex: "#0a0a0a" },
      { name: "Bone", hex: "#f5f2ec" },
      { name: "Signal red", hex: "#ef4444" },
      { name: "Electric blue", hex: "#1d4ed8" },
      { name: "Safety yellow", hex: "#facc15" },
      { name: "Moss", hex: "#16a34a" },
    ],
  },
  {
    key: "PETG",
    label: "PETG",
    tagline: "Tough & watertight. Best for outdoor parts.",
    densityGPerCm3: MATERIAL_DENSITY_G_PER_CM3.PETG,
    pricePerGramGbp: MATERIAL_RATE_GBP_PER_GRAM.PETG,
    colors: [
      { name: "Clear", hex: "#d9e2e8" },
      { name: "Black", hex: "#111111" },
      { name: "White", hex: "#f4f4f4" },
      { name: "Cobalt", hex: "#1e40af" },
    ],
  },
  {
    key: "ABS",
    label: "ABS",
    tagline: "Heat-resistant, automotive-grade.",
    densityGPerCm3: MATERIAL_DENSITY_G_PER_CM3.ABS,
    pricePerGramGbp: MATERIAL_RATE_GBP_PER_GRAM.ABS,
    colors: [
      { name: "Jet", hex: "#0a0a0a" },
      { name: "Ivory", hex: "#f1eadb" },
      { name: "Pewter", hex: "#6b7280" },
    ],
  },
  {
    key: "TPU",
    label: "TPU",
    tagline: "Flexible 95A. Gaskets, grips, hinges.",
    densityGPerCm3: MATERIAL_DENSITY_G_PER_CM3.TPU,
    pricePerGramGbp: MATERIAL_RATE_GBP_PER_GRAM.TPU,
    badge: "Specialist",
    colors: [
      { name: "Black", hex: "#0a0a0a" },
      { name: "Cherry", hex: "#dc2626" },
      { name: "Midnight", hex: "#111827" },
    ],
  },
];

export type QualityKey = "draft" | "standard" | "fine";
export type Quality = {
  key: QualityKey;
  label: string;
  layerMm: number;
  timeMultiplier: number;
};
export const QUALITIES: Quality[] = [
  { key: "draft", label: "Draft", layerMm: 0.28, timeMultiplier: 0.7 },
  { key: "standard", label: "Standard", layerMm: 0.2, timeMultiplier: 1.0 },
  { key: "fine", label: "Fine", layerMm: 0.12, timeMultiplier: 1.7 },
];

export type Maker = {
  id: string;
  /** Stable React/Marker key for the map. When a maker has multiple pickup
   *  locations they appear as multiple Marker entries sharing the same `id`
   *  (so clicking any of them selects the maker), but each carrying its own
   *  `pinId`. Falls back to `id` when only one pin is rendered. */
  pinId?: string;
  name: string;
  area: string;
  postcode: string;
  printer: string;
  statusEta: string;
  rating: number;
  lat: number;
  lng: number;
  /** True if the printer is accepting jobs right now. */
  available: boolean;
  /** Materials this printer is profiled for. */
  materials: MaterialKey[];
  /** Maximum printable bounding box in mm (X, Y, Z). */
  buildVolumeMm: { x: number; y: number; z: number };
  /** Minutes of queued work ahead of a new job. */
  queueMins: number;
  /** Maker's own £/hour rate — used for the "cheapest" sort. */
  machineRateGbpPerHour: number;
  /** True when the printer has an AMS / MMU and can run multi-colour jobs. */
  supportsMultiMaterial: boolean;
};

export const MAKERS: Maker[] = [
  {
    id: "hub-a1",
    name: "State Tech Hackspace",
    area: "Central · A1",
    postcode: "HUB-A1",
    printer: "Bambu Lab X1C",
    statusEta: "Ready in 12 min",
    rating: 4.9,
    lat: 51.4988,
    lng: -0.1749,
    available: true,
    materials: ["PLA", "PETG", "ABS"],
    buildVolumeMm: { x: 256, y: 256, z: 256 },
    queueMins: 12,
    machineRateGbpPerHour: 2.4,
    supportsMultiMaterial: true, // Bambu X1C w/ AMS — up to 4 colours
  },
  {
    id: "hub-a2",
    name: "Metropolitan Making Institute",
    area: "Central · A2",
    postcode: "HUB-A2",
    printer: "Prusa Core One",
    statusEta: "Ready in 18 min",
    rating: 4.8,
    lat: 51.5246,
    lng: -0.1340,
    available: true,
    materials: ["PLA", "PETG"],
    buildVolumeMm: { x: 250, y: 220, z: 270 },
    queueMins: 18,
    machineRateGbpPerHour: 2.2,
    supportsMultiMaterial: false, // Prusa Core One, no MMU on this unit
  },
  {
    id: "hub-c4",
    name: "East Docks Fabrication",
    area: "East Docks · C4",
    postcode: "HUB-C4",
    printer: "Creality K1C",
    statusEta: "Ready in 24 min",
    rating: 4.7,
    lat: 51.5074,
    lng: -0.0277,
    available: true,
    materials: ["PLA", "PETG", "TPU"],
    buildVolumeMm: { x: 220, y: 220, z: 250 },
    queueMins: 24,
    machineRateGbpPerHour: 1.9,
    supportsMultiMaterial: false,
  },
  {
    id: "hub-b3",
    name: "Northside Print Collective",
    area: "Northside · B3",
    postcode: "HUB-B3",
    printer: "Bambu Lab P2S",
    statusEta: "Queued · 1 ahead",
    rating: 4.8,
    lat: 51.5448,
    lng: -0.1057,
    available: true,
    materials: ["PLA", "PETG", "ABS", "TPU"],
    buildVolumeMm: { x: 256, y: 256, z: 256 },
    queueMins: 42,
    machineRateGbpPerHour: 2.5,
    supportsMultiMaterial: true, // Bambu P2S w/ AMS Lite — up to 4 colours
  },
  {
    id: "hub-s2",
    name: "Southside Studio",
    area: "Southside · S2",
    postcode: "HUB-S2",
    printer: "Prusa MK4S",
    statusEta: "Ready in 9 min",
    rating: 4.9,
    lat: 51.4735,
    lng: -0.0800,
    available: true,
    materials: ["PLA", "PETG"],
    buildVolumeMm: { x: 250, y: 210, z: 220 },
    queueMins: 9,
    machineRateGbpPerHour: 2.1,
    supportsMultiMaterial: false, // Prusa MK4S, no MMU on this unit
  },
  {
    id: "hub-w1",
    name: "Riverside Labs",
    area: "Riverside · W1",
    postcode: "HUB-W1",
    printer: "Prusa XL",
    statusEta: "Printing · 42 min left",
    rating: 4.7,
    lat: 51.5128,
    lng: -0.2194,
    available: false,
    materials: ["PLA", "PETG", "ABS"],
    buildVolumeMm: { x: 360, y: 360, z: 360 },
    queueMins: 120,
    machineRateGbpPerHour: 2.8,
    supportsMultiMaterial: true, // Prusa XL — independent toolheads, 5 colours
  },
];

/** Service fee is £2 base + 10% of the printing subtotal — covers
 *  Fabricate's platform overhead and scales with order size. */
export const SERVICE_FEE_BASE_GBP = 2;
export const SERVICE_FEE_PCT = 0.10;
/** Floor on machine-time cost. A 2-minute print still costs the maker setup,
 *  preheat, bed prep and slicing time — £3 reflects that. */
export const MACHINE_TIME_MIN_GBP = 3;
export const MARGIN_MULTIPLIER = 1.4;
export const MACHINE_TIME_RATE_GBP_PER_HOUR = 2.4;

/**
 * Volume price breaks for multi-unit orders (branded merch runs).
 *
 * A batch of N is cheaper per unit than N separate jobs: one slice, one bed
 * setup, one handover. The break is passed to the creator as a discount on
 * the printing subtotal only — service fee and delivery are never discounted,
 * matching how community `discountPct` already behaves.
 *
 * Highest qualifying tier wins. Keep ordered by minQty ascending.
 */
export const QUANTITY_TIERS = [
  { minQty: 10, discountPct: 10, label: "10+ · −10%" },
  { minQty: 25, discountPct: 20, label: "25+ · −20%" },
] as const;

/** Discount % earned by ordering `quantity` units (0 below the first tier). */
export function quantityTierDiscountPct(quantity: number): number {
  let pct = 0;
  for (const tier of QUANTITY_TIERS) {
    if (quantity >= tier.minQty) pct = tier.discountPct;
  }
  return pct;
}

/** The next unreached tier, for "add 3 more to save 10%" UI. Null at the top. */
export function nextQuantityTier(
  quantity: number,
): (typeof QUANTITY_TIERS)[number] | null {
  return QUANTITY_TIERS.find((t) => quantity < t.minQty) ?? null;
}

export const DELIVERY_OPTIONS = [
  {
    key: "pickup" as const,
    label: "Pickup",
    priceGbp: 0,
    eta: "Notified when ready · free",
    blurb: "Collect from the maker. Free.",
  },
  {
    key: "courier" as const,
    label: "Courier (where available)",
    priceGbp: 7.5,
    eta: "Typically within the day",
    blurb: "Bicycle courier on eligible orders. Subject to maker location.",
  },
];
