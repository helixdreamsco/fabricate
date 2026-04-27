export type MaterialKey = "PLA" | "PETG" | "ABS" | "TPU";

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
    densityGPerCm3: 1.24,
    pricePerGramGbp: 0.085,
    badge: "Most popular",
    colors: [
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
    densityGPerCm3: 1.27,
    pricePerGramGbp: 0.11,
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
    densityGPerCm3: 1.04,
    pricePerGramGbp: 0.12,
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
    densityGPerCm3: 1.21,
    pricePerGramGbp: 0.18,
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

export const SERVICE_FEE_GBP = 1.5;
export const MARGIN_MULTIPLIER = 1.4;
export const MACHINE_TIME_RATE_GBP_PER_HOUR = 2.4;

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
