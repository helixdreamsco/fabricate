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
import { serializeJobEvent, type SerializedJobMessage } from "@/lib/jobs";
import { formatGbp } from "@/lib/money";
import { paymentMode } from "@/lib/payments";
import { MakerControls } from "./MakerControls";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function MakerJobPage({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/maker");
  const { id } = await params;

  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/maker/profile");

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, image: true, email: true } },
      assignedMaker: true,
      payment: true,
    },
  });
  if (!job) notFound();
  if (job.assignedMakerId !== profile.id) {
    return (
      <div className="flex-1 bg-grid-none">
        <div className="max-w-[720px] mx-auto px-5 md:px-8 py-10 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
            Forbidden
          </div>
          <h1 className="text-2xl font-bold mb-3">This job isn&rsquo;t assigned to you</h1>
          <Link href="/maker" className="font-mono text-[10px] uppercase tracking-[0.18em] underline">
            Back to maker dashboard
          </Link>
        </div>
      </div>
    );
  }

  const [events, messages, pickupTokens] = await Promise.all([
    prisma.jobEvent.findMany({ where: { jobId: id }, orderBy: { createdAt: "asc" } }),
    prisma.jobMessage.findMany({
      where: { jobId: id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true, image: true } } },
      take: 200,
    }),
    prisma.pickupToken.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);

  const serializedMessages: SerializedJobMessage[] = messages.map((m) => ({
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
  const myExpectedPayoutPence = job.payment
    ? job.payment.amountPence - job.payment.platformFeePence
    : 0;

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-6 md:py-8">
        <Link href="/maker" className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black mb-3">
          <ArrowLeft className="w-3 h-3" strokeWidth={2.2} /> Maker dashboard
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight truncate">
              {job.fileName}
            </h1>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/45 mt-1.5 flex items-center gap-2 flex-wrap">
              <span>From {job.creator.name ?? job.creator.email}</span>
              <span>·</span>
              <span>Creator collects from you</span>
              {mode === "sim" ? <TestModeBadge /> : null}
            </div>
          </div>
          <StatusPill status={job.status} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
          {/* Left: spec + controls + timeline */}
          <div className="space-y-5 min-w-0">
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
                <Spec label="Estimated time" value={job.estimatedMinutes ? `${Math.round(job.estimatedMinutes / 60)} h` : "—"} />
                <Spec label="Quoted price" value={formatGbp(job.quotedPricePence)} />
                <Spec label="Your payout" value={formatGbp(myExpectedPayoutPence)} />
              </dl>
              {job.fileUrl ? (
                <a
                  href={job.fileUrl}
                  className="inline-block mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-black/65 hover:text-black underline"
                >
                  Download mesh file ↓
                </a>
              ) : null}
              {job.notes ? (
                <div className="mt-4 text-sm font-light text-black/70 whitespace-pre-wrap border-t border-black/[0.06] pt-3">
                  {job.notes}
                </div>
              ) : null}
            </Card>

            <MakerControls
              jobId={job.id}
              status={job.status}
              latestPickup={pickupTokens[0]
                ? {
                    code: pickupTokens[0].code,
                    direction: pickupTokens[0].direction,
                    expiresAt: pickupTokens[0].expiresAt.toISOString(),
                    consumedAt: pickupTokens[0].consumedAt?.toISOString() ?? null,
                  }
                : null}
              completionPhoto={{
                required: job.requireCompletionPhoto,
                feePence: profile.freeCompletionPhoto ? 0 : job.completionPhotoFeePence,
                url: job.completionPhotoUrl,
                uploadedAt: job.completionPhotoUploadedAt?.toISOString() ?? null,
              }}
            />

            <Card className="p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-4">
                Timeline
              </div>
              <JobTimeline events={events.map(serializeJobEvent)} />
            </Card>
          </div>

          {/* Right: chat */}
          <Card className="p-0 lg:sticky lg:top-20 self-start">
            <div className="px-4 py-3 border-b border-black/[0.06] font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
              Chat with creator
            </div>
            <JobChat
              jobId={job.id}
              viewerId={session.user.id}
              initialMessages={serializedMessages}
            />
          </Card>
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
