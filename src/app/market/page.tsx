import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { MaterialKey } from "@/lib/catalog";
import { MakerMarket } from "./MakerMarket";
import { CreatorInsights } from "./CreatorInsights";

export const dynamic = "force-dynamic";

function parseMaterials(s: string | null): MaterialKey[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v.filter((m): m is MaterialKey =>
      m === "PLA" || m === "PETG" || m === "ABS" || m === "TPU"
    );
  } catch {
    return [];
  }
}

export default async function MarketPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/market");

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    include: { printers: { orderBy: { priority: "asc" } } },
  });

  // Always pull open jobs — we use them for both views (insights aggregates
  // and the maker's filtered list).
  const openJobs = await prisma.job.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      prioritizedMaker: { select: { id: true, displayName: true } },
      _count: { select: { bids: true } },
    },
  });

  // Stats also pull recent COMPLETED jobs — useful for "average price by
  // size" comparisons that creators can use to set their own quotes.
  const recentCompleted = await prisma.job.findMany({
    where: {
      status: "COMPLETED",
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) }, // last 30 days
    },
    select: {
      quotedPricePence: true,
      material: true,
      estimatedGrams: true,
      isMultiMaterial: true,
    },
  });

  if (!profile) {
    return (
      <CreatorInsights
        openJobs={openJobs.map((j) => ({
          id: j.id,
          quotedPricePence: j.quotedPricePence,
          material: j.material,
          estimatedGrams: j.estimatedGrams,
          isMultiMaterial: j.isMultiMaterial,
          createdAt: j.createdAt.toISOString(),
        }))}
        recentCompleted={recentCompleted.map((j) => ({
          quotedPricePence: j.quotedPricePence,
          material: j.material,
          estimatedGrams: j.estimatedGrams,
          isMultiMaterial: j.isMultiMaterial,
        }))}
      />
    );
  }

  // Maker view: load bookmarks + their bid status per job.
  const [myBookmarks, myBids] = await Promise.all([
    prisma.makerJobBookmark.findMany({
      where: { makerId: profile.id, jobId: { in: openJobs.map((j) => j.id) } },
      select: { jobId: true, status: true },
    }),
    prisma.jobBid.findMany({
      where: { makerId: profile.id, jobId: { in: openJobs.map((j) => j.id) } },
      select: { jobId: true, status: true },
    }),
  ]);

  const bookmarkByJob = Object.fromEntries(myBookmarks.map((b) => [b.jobId, b.status]));
  const bidByJob = Object.fromEntries(myBids.map((b) => [b.jobId, b.status]));

  return (
    <MakerMarket
      jobs={openJobs.map((j) => ({
        id: j.id,
        fileName: j.fileName,
        material: j.material,
        partColors: j.partColors,
        infillPct: j.infillPct,
        quantity: j.quantity,
        isMultiMaterial: j.isMultiMaterial,
        partsCount: j.partsCount,
        estimatedGrams: j.estimatedGrams,
        estimatedMinutes: j.estimatedMinutes,
        quotedPricePence: j.quotedPricePence,
        notes: j.notes,
        createdAt: j.createdAt.toISOString(),
        creatorName: j.creator.name,
        creatorImage: j.creator.image,
        prioritizedMakerId: j.prioritizedMakerId,
        bidsCount: j._count.bids,
      }))}
      bookmarks={bookmarkByJob}
      myBids={bidByJob}
      profile={(() => {
        // Fold the maker's full printer set into a single "best capability"
        // view for the maker-market scoring: any-printer hasAMS counts as
        // AMS-capable, the union of stocked materials counts as stockable,
        // and the primary printer's model surfaces in the header.
        const active = profile.printers.filter((p) => p.active);
        const list = active.length > 0 ? active : profile.printers;
        const sorted = list.slice().sort((a, b) => a.priority - b.priority);
        const primary = sorted[0] ?? null;
        const anyAms = list.some((p) => p.hasAMS);
        const matSet = new Set<MaterialKey>();
        for (const p of list) {
          for (const m of parseMaterials(p.materials)) matSet.add(m);
        }
        return {
          id: profile.id,
          displayName: profile.displayName,
          printerModel: primary?.printerModel ?? null,
          hasAMS: anyAms,
          materials: Array.from(matSet),
          stripeOnboarded: profile.stripeOnboarded,
        };
      })()}
    />
  );
}
