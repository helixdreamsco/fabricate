/**
 * Helpers around MakerProfile — the "real maker user" model that lives next
 * to the static catalogue. Bidding + payouts require one of these; the
 * catalogue at lib/catalog.ts stays for marketing/discovery only.
 */

import { prisma } from "./prisma";
import type { PickupLocation, Printer } from "@prisma/client";
import { parsePrinterMaterials, type PrinterSummary, summarisePrinter } from "./printers";

export async function getMakerProfileByUserId(userId: string) {
  return prisma.makerProfile.findUnique({
    where: { userId },
    include: {
      printers: { orderBy: { priority: "asc" } },
      pickupLocations: { orderBy: { ordering: "asc" } },
    },
  });
}

/** Hard cap on how many pickup locations one maker may advertise. */
export const MAX_PICKUP_LOCATIONS = 5;

export async function ensureMakerProfile(opts: {
  userId: string;
  displayName: string;
}) {
  const existing = await prisma.makerProfile.findUnique({
    where: { userId: opts.userId },
  });
  if (existing) return existing;
  return prisma.makerProfile.create({
    data: { userId: opts.userId, displayName: opts.displayName },
  });
}

export type SharedCommunity = {
  id: string;
  slug: string;
  name: string;
  iconHue: number;
};

/**
 * One pickup point a maker advertises. The marketplace map renders one pin
 * per location; the maker's profile card lists them. lat/lng are filled
 * from postcodes.io geocoding when /api/makers builds the response — null
 * if the postcode hasn't resolved.
 */
export type PickupLocationSummary = {
  id: string;
  label: string | null;
  postcode: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  isPrimary: boolean;
  ordering: number;
};

/**
 * Public-facing maker summary. Headline fields (`printerModel`, `hasAMS`,
 * `materials`) come from the maker's primary (highest-priority active)
 * printer — that's what surfaces everywhere a single printer is shown.
 * The full list is in `printers` for views that want to display all of
 * them (e.g. the public profile page).
 */
export type MakerProfileSummary = {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  /** Primary location's postcode — mirror of MakerProfile.postcode. The
   *  full set is in `locations`; this single field stays for views that
   *  only render one outward code (list rows, JSON-LD city). */
  postcode: string | null;
  /** Resolved from postcode via postcodes.io. Null if no postcode set
   *  on the profile or geocoding failed/unavailable. */
  lat: number | null;
  lng: number | null;
  /** Every pickup location the maker has advertised, primary first. The
   *  marketplace map renders one pin per entry whose lat/lng resolved. */
  locations: PickupLocationSummary[];
  printerModel: string | null;
  hasAMS: boolean;
  materials: string[];
  printers: PrinterSummary[];
  stripeOnboarded: boolean;
  freeCompletionPhoto: boolean;
  sharedCommunities: SharedCommunity[];
};

export function pickPrimaryPrinter(printers: Printer[]): Printer | null {
  const active = printers.filter((p) => p.active);
  const sorted = (active.length > 0 ? active : printers).sort(
    (a, b) => a.priority - b.priority,
  );
  return sorted[0] ?? null;
}

export function summarize(
  p: {
    id: string;
    userId: string;
    displayName: string;
    bio: string | null;
    postcode: string | null;
    stripeOnboarded: boolean;
    freeCompletionPhoto: boolean;
    printers: Printer[];
    pickupLocations?: PickupLocation[];
  },
  sharedCommunities: SharedCommunity[] = [],
): MakerProfileSummary {
  const primary = pickPrimaryPrinter(p.printers);
  const sortedLocations = (p.pickupLocations ?? [])
    .slice()
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.ordering - b.ordering;
    });
  const locations: PickupLocationSummary[] = sortedLocations.map((l) => ({
    id: l.id,
    label: l.label,
    postcode: l.postcode,
    // Caller fills these from a batch geocoding lookup if it wants them.
    lat: null,
    lng: null,
    notes: l.notes,
    isPrimary: l.isPrimary,
    ordering: l.ordering,
  }));
  return {
    id: p.id,
    userId: p.userId,
    displayName: p.displayName,
    bio: p.bio,
    postcode: p.postcode,
    // Caller fills these from a batch geocoding lookup if it wants them.
    lat: null,
    lng: null,
    locations,
    printerModel: primary?.printerModel ?? null,
    hasAMS: primary?.hasAMS ?? false,
    materials: primary ? parsePrinterMaterials(primary.materials) : [],
    printers: p.printers
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map(summarisePrinter),
    stripeOnboarded: p.stripeOnboarded,
    freeCompletionPhoto: p.freeCompletionPhoto,
    sharedCommunities,
  };
}
