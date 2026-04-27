/**
 * Shared community payload types — mirror the JSON shapes returned by the
 * API routes so client components can import them without duplicating
 * declarations.
 */

export type CommunityMini = {
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
  createdAt: string;
  updatedAt: string;
};

export type CommunityWithMeta = CommunityMini & {
  memberCount: number;
  messageCount: number;
  role: string;
  joinedAt?: string;
};

export type CommunityFull = CommunityMini & {
  memberCount: number;
  messageCount: number;
  role: string;
  members: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: string;
    joinedAt: string;
  }>;
};

/** Makers in a community — real `MakerProfile` users who are also members.
 *  Replaces the demo-era catalogue-affiliation concept. */
export type CommunityMakerSummary = {
  id: string;          // MakerProfile.id
  userId: string;
  displayName: string;
  printerModel: string | null;
  postcode: string | null;
  hasAMS: boolean;
  freeCompletionPhoto: boolean;
  stripeOnboarded: boolean;
  role: string;        // member | admin | owner
};

export type CommunityMessage = {
  id: string;
  communityId: string;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  createdAt: string;
};

export type InvitePreview = {
  id: string;
  slug: string;
  inviteCode: string;
  name: string;
  description: string | null;
  iconHue: number;
  ownerName: string | null;
  ownerImage: string | null;
  memberCount: number;
  discountPct: number;
  freeMode: boolean;
  priorityQueue: boolean;
  alreadyMember: boolean;
};
