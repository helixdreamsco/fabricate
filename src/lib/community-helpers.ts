import { customAlphabet } from "nanoid";
import { prisma } from "./prisma";

// Invite codes are public URLs — keep them hard to brute-force, lowercase +
// digits for easy sharing and no ambiguous characters.
export const generateInviteCode = customAlphabet(
  "abcdefghjkmnpqrstuvwxyz23456789",
  10,
);

/** Turn a display name into a URL slug, guaranteed unique. */
export async function generateUniqueSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "community";

  let candidate = base;
  let n = 2;
  // Unlikely to loop many times for a small demo DB.
  while (await prisma.community.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${n++}`;
    if (n > 100) {
      candidate = `${base}-${Date.now().toString(36).slice(-4)}`;
      break;
    }
  }
  return candidate;
}

/** Deterministic hue in 0..359 from a string, used for generated avatars. */
export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}

/**
 * Returns membership record for (userId, communityId) or null. Throws if
 * the community doesn't exist — helpful for surfacing 404 vs 403 cleanly.
 */
export async function getMembership(userId: string, communityId: string) {
  return prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
}

export function serializeCommunity<
  T extends {
    id: string;
    slug: string;
    inviteCode: string;
    name: string;
    description: string | null;
    iconHue: number;
    ownerId: string;
    discountPct: number;
    freeMode: boolean;
    priorityQueue: boolean;
    memberOnlyMakers: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
>(c: T) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
