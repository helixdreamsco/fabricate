import { haversineKm } from "./utils";

/**
 * Courier providers we *could* integrate with. None are wired to a real
 * upstream API yet — every quote here is computed locally from the
 * provider's catchment + a synthetic pricing model. When we plug in a real
 * API (Stuart first), the `status` flips to `"live"` and `quote()` calls
 * the provider's quote endpoint instead.
 */

export type CourierStatus = "live" | "stub" | "off";

export type CourierProvider = {
  id: "stuart" | "uber-direct" | "gophr" | "mock";
  name: string;
  status: CourierStatus;
  brandColor: string;
  /** Catchment defined as a circle around a city centre. Real providers will
   *  use polygons / postcode districts; this is a serviceable approximation. */
  catchment: { lat: number; lng: number; radiusKm: number };
  pricing: {
    baseGbp: number;
    perKmGbp: number;
    /** Minimum charge regardless of distance. */
    minGbp: number;
    /** Hard cap — distances beyond this are out of service even inside catchment. */
    maxDistanceKm: number;
  };
  /** Median pickup-to-drop time in minutes, used for ETA estimates. */
  baseEtaMin: number;
  perKmEtaMin: number;
};

export const COURIERS: CourierProvider[] = [
  {
    id: "stuart",
    name: "Stuart",
    status: "stub",
    brandColor: "#FF5500",
    catchment: { lat: 51.5074, lng: -0.1278, radiusKm: 12 },
    pricing: { baseGbp: 4.5, perKmGbp: 0.6, minGbp: 6, maxDistanceKm: 18 },
    baseEtaMin: 25,
    perKmEtaMin: 4,
  },
  {
    id: "uber-direct",
    name: "Uber Direct",
    status: "stub",
    brandColor: "#000000",
    catchment: { lat: 51.5074, lng: -0.1278, radiusKm: 18 },
    pricing: { baseGbp: 5.5, perKmGbp: 0.55, minGbp: 7, maxDistanceKm: 25 },
    baseEtaMin: 30,
    perKmEtaMin: 3.5,
  },
  {
    id: "gophr",
    name: "Gophr",
    status: "stub",
    brandColor: "#16a34a",
    catchment: { lat: 51.5074, lng: -0.1278, radiusKm: 10 },
    pricing: { baseGbp: 4, perKmGbp: 0.55, minGbp: 5.5, maxDistanceKm: 12 },
    baseEtaMin: 22,
    perKmEtaMin: 4.5,
  },
];

export type Coord = { lat: number; lng: number };

export type CourierQuote = {
  provider: CourierProvider;
  available: boolean;
  priceGbp: number | null;
  etaMin: number | null;
  /** Why this provider can't service the route. Null when available. */
  reason: null | "pickup-out-of-zone" | "drop-out-of-zone" | "distance-cap" | "off";
  pickupDistanceKm: number;
  dropDistanceKm: number;
  routeKm: number;
};

export function quoteAllCouriers(
  pickup: Coord,
  drop: Coord,
): CourierQuote[] {
  return COURIERS.map((p) => quoteCourier(p, pickup, drop));
}

export function quoteCourier(
  p: CourierProvider,
  pickup: Coord,
  drop: Coord,
): CourierQuote {
  const pickupDistanceKm = haversineKm(pickup, p.catchment);
  const dropDistanceKm = haversineKm(drop, p.catchment);
  const routeKm = haversineKm(pickup, drop);

  if (p.status === "off") {
    return {
      provider: p,
      available: false,
      priceGbp: null,
      etaMin: null,
      reason: "off",
      pickupDistanceKm,
      dropDistanceKm,
      routeKm,
    };
  }

  if (pickupDistanceKm > p.catchment.radiusKm)
    return {
      provider: p,
      available: false,
      priceGbp: null,
      etaMin: null,
      reason: "pickup-out-of-zone",
      pickupDistanceKm,
      dropDistanceKm,
      routeKm,
    };

  if (dropDistanceKm > p.catchment.radiusKm)
    return {
      provider: p,
      available: false,
      priceGbp: null,
      etaMin: null,
      reason: "drop-out-of-zone",
      pickupDistanceKm,
      dropDistanceKm,
      routeKm,
    };

  if (routeKm > p.pricing.maxDistanceKm)
    return {
      provider: p,
      available: false,
      priceGbp: null,
      etaMin: null,
      reason: "distance-cap",
      pickupDistanceKm,
      dropDistanceKm,
      routeKm,
    };

  const price = Math.max(
    p.pricing.minGbp,
    p.pricing.baseGbp + routeKm * p.pricing.perKmGbp,
  );
  const eta = Math.round(p.baseEtaMin + routeKm * p.perKmEtaMin);

  return {
    provider: p,
    available: true,
    priceGbp: Math.round(price * 100) / 100,
    etaMin: eta,
    reason: null,
    pickupDistanceKm,
    dropDistanceKm,
    routeKm,
  };
}

/** Cheapest available quote across all providers, or null when none can ship. */
export function bestCourierQuote(
  pickup: Coord,
  drop: Coord,
): CourierQuote | null {
  const all = quoteAllCouriers(pickup, drop).filter((q) => q.available);
  if (all.length === 0) return null;
  all.sort((a, b) => (a.priceGbp ?? Infinity) - (b.priceGbp ?? Infinity));
  return all[0];
}

export function reasonCopy(reason: CourierQuote["reason"]): string {
  switch (reason) {
    case "pickup-out-of-zone":
      return "Maker is outside our pickup zone";
    case "drop-out-of-zone":
      return "Your address is outside the courier's drop zone";
    case "distance-cap":
      return "Route exceeds the courier's maximum distance";
    case "off":
      return "Provider currently offline";
    default:
      return "Available";
  }
}
