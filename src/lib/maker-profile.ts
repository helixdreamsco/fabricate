/**
 * Helpers around MakerProfile — the "real maker user" model that lives next
 * to the static catalogue. Bidding + payouts require one of these; the
 * catalogue at lib/catalog.ts stays for marketing/discovery only.
 */

import { prisma } from "./prisma";

export async function getMakerProfileByUserId(userId: string) {
  return prisma.makerProfile.findUnique({ where: { userId } });
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

export type MakerProfileSummary = {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  postcode: string | null;
  hasAMS: boolean;
  printerModel: string | null;
  stripeOnboarded: boolean;
  freeCompletionPhoto: boolean;
  /** Communities the maker shares with the requesting creator. Empty if
   *  none / not applicable. */
  sharedCommunities: SharedCommunity[];
};

export function summarize(
  p: {
    id: string;
    userId: string;
    displayName: string;
    bio: string | null;
    postcode: string | null;
    hasAMS: boolean;
    printerModel: string | null;
    stripeOnboarded: boolean;
    freeCompletionPhoto: boolean;
  },
  sharedCommunities: SharedCommunity[] = [],
): MakerProfileSummary {
  return {
    id: p.id,
    userId: p.userId,
    displayName: p.displayName,
    bio: p.bio,
    postcode: p.postcode,
    hasAMS: p.hasAMS,
    printerModel: p.printerModel,
    stripeOnboarded: p.stripeOnboarded,
    freeCompletionPhoto: p.freeCompletionPhoto,
    sharedCommunities,
  };
}
