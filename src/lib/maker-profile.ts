/**
 * Helpers around MakerProfile — the "real maker user" model that lives next
 * to the static catalogue. Bidding + payouts require one of these; the
 * catalogue at lib/catalog.ts stays for marketing/discovery only.
 */

import { prisma } from "./prisma";
import type { Printer } from "@prisma/client";
import { parsePrinterMaterials, type PrinterSummary, summarisePrinter } from "./printers";

export async function getMakerProfileByUserId(userId: string) {
  return prisma.makerProfile.findUnique({
    where: { userId },
    include: { printers: { orderBy: { priority: "asc" } } },
  });
}

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
  postcode: string | null;
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
  },
  sharedCommunities: SharedCommunity[] = [],
): MakerProfileSummary {
  const primary = pickPrimaryPrinter(p.printers);
  return {
    id: p.id,
    userId: p.userId,
    displayName: p.displayName,
    bio: p.bio,
    postcode: p.postcode,
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
