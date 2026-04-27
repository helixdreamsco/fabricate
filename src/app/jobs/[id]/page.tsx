import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/jobs/StatusPill";
import { JobTimeline } from "@/components/jobs/JobTimeline";
import { JobChat } from "@/components/jobs/JobChat";
import { TestModeBadge } from "@/components/jobs/TestModeBadge";
import { PickupCodeDisplay } from "@/components/jobs/PickupCodeDisplay";
import { serializeJobEvent, type SerializedJobMessage } from "@/lib/jobs";
import { formatGbp } from "@/lib/money";
import { paymentMode } from "@/lib/payments";
import { pickupQrPayload } from "@/lib/pickup";
import { CreatorBidPanel } from "./CreatorBidPanel";
import { CreatorActions } from "./CreatorActions";
import { MakerBidPanel } from "./MakerBidPanel";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function JobDetailPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/jobs");
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, image: true, email: true } },
      assignedMaker: true,
      prioritizedMaker: { select: { id: true, displayName: true } },
      payment: true,
    },
  });
  if (!job) notFound();

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  const isCreator = job.creatorId === session.user.id;
  const isAssignedMaker = profile && job.assignedMakerId === profile.id;
  const canMarketRead = !isCreator && !isAssignedMaker && job.status === "OPEN" && !!profile;

  if (!isCreator && !isAssignedMaker && !canMarketRead) {
    return (
      <div className="flex-1 bg-grid-none">
        <div className="max-w-[720px] mx-auto px-5 md:px-8 py-10 text-center">
          <h1 className="text-2xl font-bold mb-3">You don&rsquo;t have access to this job</h1>
          <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.18em] underline">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  // If maker is assigned to this job, redirect to maker view (cleaner separation).
  if (isAssignedMaker) {
    redirect(`/maker/jobs/${job.id}`);
  }

  // Communities the creator belongs to — used to badge bids from
  // community-mates on the creator-facing bid list.
  const creatorCommunityIds = isCreator
    ? (await prisma.communityMember.findMany({
        where: { userId: session.user.id },
        select: { communityId: true },
      })).map((c) => c.communityId)
    : [];

  const [events, messages, bids, myBid, myBookmark, latestPickup] = await Promise.all([
    prisma.jobEvent.findMany({ where: { jobId: id }, orderBy: { createdAt: "asc" } }),
    isCreator
      ? prisma.jobMessage.findMany({
          where: { jobId: id },
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, image: true } } },
          take: 200,
        })
      : Promise.resolve([]),
    isCreator
      ? prisma.jobBid.findMany({
          where: { jobId: id, status: { in: ["PENDING", "ACCEPTED"] } },
          orderBy: [{ status: "desc" }, { priceOfferPence: "asc" }],
          include: {
            maker: {
              select: {
                id: true, displayName: true, bio: true, postcode: true,
                hasAMS: true, printerModel: true, stripeOnboarded: true,
                freeCompletionPhoto: true,
                user: {
                  select: {
                    memberships: {
                      where: creatorCommunityIds.length > 0
                        ? { communityId: { in: creatorCommunityIds } }
                        : { communityId: { in: [] } },
                      select: {
                        community: {
                          select: { id: true, slug: true, name: true, iconHue: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    profile
      ? prisma.jobBid.findUnique({
          where: { jobId_makerId: { jobId: id, makerId: profile.id } },
        })
      : Promise.resolve(null),
    profile
      ? prisma.makerJobBookmark.findUnique({
          where: { makerId_jobId: { makerId: profile.id, jobId: id } },
        })
      : Promise.resolve(null),
    isCreator
      ? prisma.pickupToken.findFirst({
          where: { jobId: id, direction: "MAKER_TO_CREATOR", consumedAt: null },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  const serializedMessages: SerializedJobMessage[] = (messages as Array<{
    id: string; jobId: string; authorId: string; body: string;
    imageUrl: string | null; imageMime: string | null; createdAt: Date;
    author: { id: string; name: string | null; image: string | null };
  }>).map((m) => ({
    id: m.id,
    jobId: m.jobId,
    authorId: m.authorId,
    authorName: m.author.name,
    authorImage: m.author.image,
    body: m.body,
    imageUrl: m.imageUrl,
    imageMime: m.imageMime,
    createdAt: m.createdAt.toISOString(),
  }));

  const mode = paymentMode();
  const pickupActive = latestPickup && latestPickup.expiresAt > new Date();

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-6 md:py-8">
        <Link
          href={isCreator ? "/jobs" : "/market"}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black mb-3"
        >
          <ArrowLeft className="w-3 h-3" strokeWidth={2.2} />
          {isCreator ? "My jobs" : "Open market"}
        </Link>

        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight truncate">
              {job.fileName}
            </h1>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/45 mt-1.5 flex items-center gap-2 flex-wrap">
              <span>{isCreator ? "Posted by you" : `From ${job.creator.name ?? job.creator.email}`}</span>
              {job.assignedMaker ? (
                <>
                  <span>·</span>
                  <span>
                    Collect from {job.assignedMaker.displayName}
                    {job.assignedMaker.postcode ? ` · ${job.assignedMaker.postcode}` : ""}
                  </span>
                </>
              ) : null}
              {mode === "sim" ? <TestModeBadge /> : null}
            </div>
          </div>
          <StatusPill status={job.status} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
          {/* Left column */}
          <div className="space-y-5 min-w-0">
            {/* Spec */}
            <Card className="p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
                Print spec
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-5 text-sm">
                <Spec label="Material" value={job.material} />
                <Spec label="Infill" value={`${job.infillPct}%`} />
                <Spec label="Quantity" value={String(job.quantity)} />
                <Spec label="Multi-material" value={job.isMultiMaterial ? "Yes" : "No"} />
                <Spec label="Estimated grams" value={job.estimatedGrams ? job.estimatedGrams.toFixed(0) + " g" : "—"} />
                <Spec label="Quoted price" value={formatGbp(job.quotedPricePence)} />
              </dl>
              {job.notes ? (
                <div className="mt-4 text-sm font-light text-black/70 whitespace-pre-wrap border-t border-black/[0.06] pt-3">
                  {job.notes}
                </div>
              ) : null}
              {job.prioritizedMaker ? (
                <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                  Prioritized maker: {job.prioritizedMaker.displayName}
                </div>
              ) : null}
              {job.requireCompletionPhoto ? (
                <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] text-[10px] bg-black/[0.04] text-black/65 border border-black/[0.08]">
                  <span className="w-1.5 h-1.5 rounded-full bg-black/30" />
                  Completion photo required
                </div>
              ) : null}
            </Card>

            {/* Creator-facing completion photo, when uploaded */}
            {isCreator && job.completionPhotoUrl ? (
              <Card className="p-5">
                <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
                    Completion photo
                  </div>
                  {job.completionPhotoUploadedAt ? (
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45">
                      Uploaded {new Date(job.completionPhotoUploadedAt).toLocaleString("en-GB", {
                        dateStyle: "medium", timeStyle: "short",
                      })}
                    </div>
                  ) : null}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={job.completionPhotoUrl}
                  alt="Completion photo"
                  className="rounded-lg border border-black/[0.08] max-w-full"
                  style={{ maxHeight: 480 }}
                />
              </Card>
            ) : null}

            {/* Pickup code (creator-only) */}
            {isCreator && pickupActive && latestPickup ? (
              <PickupCodeDisplay
                code={latestPickup.code}
                qrPayload={pickupQrPayload(latestPickup.code)}
                expiresAt={latestPickup.expiresAt.toISOString()}
                makerName={job.assignedMaker?.displayName ?? null}
                makerPostcode={job.assignedMaker?.postcode ?? null}
                pickupNote={job.pickupNotes}
              />
            ) : null}

            {/* Bids list (creator-only, OPEN/ASSIGNED). Community-mate bids
                are sorted ahead of strangers within the same status, then by
                price ascending. */}
            {isCreator && job.status === "OPEN" ? (
              <CreatorBidPanel
                jobId={job.id}
                bids={bids
                  .map((b) => {
                    const sharedCommunities = (b.maker.user?.memberships ?? []).map(
                      (m) => ({
                        id: m.community.id,
                        slug: m.community.slug,
                        name: m.community.name,
                        iconHue: m.community.iconHue,
                      }),
                    );
                    return {
                      id: b.id,
                      priceOfferPence: b.priceOfferPence,
                      etaHours: b.etaHours,
                      message: b.message,
                      status: b.status,
                      maker: {
                        id: b.maker.id,
                        displayName: b.maker.displayName,
                        bio: b.maker.bio,
                        postcode: b.maker.postcode,
                        hasAMS: b.maker.hasAMS,
                        printerModel: b.maker.printerModel,
                        stripeOnboarded: b.maker.stripeOnboarded,
                        freeCompletionPhoto: b.maker.freeCompletionPhoto,
                        sharedCommunities,
                      },
                      createdAt: b.createdAt.toISOString(),
                    };
                  })
                  .sort((a, b) => {
                    // Accepted (rare here since job=OPEN) first
                    if (a.status !== b.status) return a.status === "ACCEPTED" ? -1 : 1;
                    // Community-mates first
                    const ac = a.maker.sharedCommunities.length > 0 ? 0 : 1;
                    const bc = b.maker.sharedCommunities.length > 0 ? 0 : 1;
                    if (ac !== bc) return ac - bc;
                    // Then cheapest
                    return a.priceOfferPence - b.priceOfferPence;
                  })}
                paymentMode={mode}
                payerName={session.user.name ?? null}
                payerEmail={session.user.email ?? null}
              />
            ) : null}

            {/* Maker bid panel (logged-in maker viewing OPEN job) */}
            {!isCreator && canMarketRead && profile ? (
              <MakerBidPanel
                jobId={job.id}
                quotedPricePence={job.quotedPricePence}
                myBid={myBid ? {
                  priceOfferPence: myBid.priceOfferPence,
                  etaHours: myBid.etaHours,
                  message: myBid.message,
                  status: myBid.status,
                  bidId: myBid.id,
                } : null}
                onboarded={profile.stripeOnboarded}
                initialBookmark={
                  myBookmark?.status === "SAVED" || myBookmark?.status === "HIDDEN"
                    ? (myBookmark.status as "SAVED" | "HIDDEN")
                    : null
                }
              />
            ) : null}

            {/* Creator actions row (cancel etc.) */}
            {isCreator && ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(job.status) ? (
              <CreatorActions jobId={job.id} status={job.status} />
            ) : null}

            {/* Timeline */}
            <Card className="p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-4">
                Timeline
              </div>
              <JobTimeline events={events.map(serializeJobEvent)} />
            </Card>
          </div>

          {/* Right: chat (only after assignment for creator) */}
          <div className="lg:sticky lg:top-20 self-start">
            {isCreator && job.assignedMaker ? (
              <Card className="p-0">
                <div className="px-4 py-3 border-b border-black/[0.06] font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
                  Chat with {job.assignedMaker.displayName}
                </div>
                <JobChat
                  jobId={job.id}
                  viewerId={session.user.id}
                  initialMessages={serializedMessages}
                />
              </Card>
            ) : isCreator ? (
              <Card className="p-5 text-sm font-light text-black/55 leading-relaxed">
                Chat with the maker will appear here once you accept a bid.
              </Card>
            ) : (
              <Card className="p-5 text-sm font-light text-black/55 leading-relaxed">
                Chat unlocks once the creator accepts your bid.
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mb-0.5">
        {label}
      </dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
