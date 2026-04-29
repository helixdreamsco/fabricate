import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listMakerReviews, makerRatingAggregate } from "@/lib/reviews";

export const runtime = "nodejs";

/**
 * Public read of a maker's reviews. `id` is the MakerProfile id (matching
 * how the rest of the API addresses makers).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await prisma.makerProfile.findUnique({
    where: { id },
    select: { id: true, userId: true, displayName: true },
  });
  if (!profile)
    return NextResponse.json({ error: "maker not found" }, { status: 404 });

  const [aggregate, reviews] = await Promise.all([
    makerRatingAggregate(profile.userId),
    listMakerReviews(profile.userId),
  ]);
  return NextResponse.json({
    makerId: profile.id,
    displayName: profile.displayName,
    aggregate,
    reviews,
  });
}
