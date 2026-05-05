import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { summarize, type SharedCommunity } from "@/lib/maker-profile";
import { geocodePostcodes } from "@/lib/geocoding";

/**
 * GET /api/makers
 *
 * List of registered MakerProfiles, used by the creator's "prioritize a
 * maker" picker on /checkout. Each entry is annotated with the
 * communities (if any) the requesting user shares with the maker — the
 * client uses that to bubble community-mates to the top.
 *
 * Excludes the caller's own profile so creators can't accidentally
 * prioritize themselves.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The /checkout picker excludes self by default (creators shouldn't be
  // able to prioritize their own maker profile). The homepage list passes
  // includeSelf=true so a maker viewing their own marketplace sees their
  // own listing alongside everyone else.
  const includeSelf = new URL(req.url).searchParams.get("includeSelf") === "true";

  // Communities the caller belongs to. Empty list = no community boost.
  const myMemberships = await prisma.communityMember.findMany({
    where: { userId: session.user.id },
    select: { communityId: true },
  });
  const myCommunityIds = myMemberships.map((m) => m.communityId);

  // Pull all makers (excluding self by default) and the memberships of
  // each maker's user for any of my communities. Single round-trip via
  // Prisma's nested select.
  const profiles = await prisma.makerProfile.findMany({
    where: includeSelf ? {} : { NOT: { userId: session.user.id } },
    orderBy: { createdAt: "asc" },
    include: {
      printers: { orderBy: { priority: "asc" } },
      user: {
        select: {
          memberships: {
            where: myCommunityIds.length > 0
              ? { communityId: { in: myCommunityIds } }
              : { communityId: { in: [] } }, // produce zero rows cheaply
            select: {
              community: {
                select: { id: true, slug: true, name: true, iconHue: true },
              },
            },
          },
        },
      },
    },
  });

  // Resolve postcodes → lat/lng in one batch so map markers can render.
  // Degrades gracefully (lat/lng stay null) if postcodes.io is unreachable.
  const postcodes = profiles
    .map((p) => p.postcode)
    .filter((p): p is string => !!p);
  const coords = await geocodePostcodes(postcodes);

  return NextResponse.json({
    makers: profiles.map((p) => {
      const shared: SharedCommunity[] = (p.user?.memberships ?? []).map((m) => ({
        id: m.community.id,
        slug: m.community.slug,
        name: m.community.name,
        iconHue: m.community.iconHue,
      }));
      const summary = summarize(p, shared);
      const coord = p.postcode ? coords.get(p.postcode) : undefined;
      return {
        ...summary,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
      };
    }),
  });
}
