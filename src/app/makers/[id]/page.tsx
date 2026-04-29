import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { MakerRatingBadge } from "@/components/jobs/MakerRatingBadge";
import { VerifiedBadge } from "@/components/jobs/VerifiedBadge";
import { listMakerReviews, makerRatingAggregate } from "@/lib/reviews";
import { parsePrinterMaterials } from "@/lib/printers";
import { pickPrimaryPrinter } from "@/lib/maker-profile";
import { Star } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function outwardCode(postcode: string | null): string | null {
  if (!postcode) return null;
  const m = postcode.trim().toUpperCase().match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)/);
  return m ? m[1] : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const profile = await prisma.makerProfile.findUnique({
    where: { id },
    select: { displayName: true, postcode: true },
  });
  if (!profile) return { title: "Maker not found · Fabricate" };
  const city = outwardCode(profile.postcode);
  return {
    title: `${profile.displayName}${city ? ` · ${city}` : ""} · Fabricate`,
    description: `${profile.displayName} is a verified 3D printing maker on Fabricate.`,
  };
}

export default async function PublicMakerProfilePage({ params }: Params) {
  const { id } = await params;
  const session = await auth();
  const profile = await prisma.makerProfile.findUnique({
    where: { id },
    include: {
      verification: { select: { status: true } },
      user: { select: { id: true } },
      printers: { orderBy: { priority: "asc" } },
    },
  });
  if (!profile) notFound();

  const isOwner = session?.user?.id === profile.user.id;
  const verified = profile.verification?.status === "approved";
  const city = outwardCode(profile.postcode);

  const [aggregate, reviews] = await Promise.all([
    makerRatingAggregate(profile.user.id),
    listMakerReviews(profile.user.id, 50),
  ]);

  const primaryPrinter = pickPrimaryPrinter(profile.printers);

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[900px] mx-auto px-5 md:px-8 py-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
          Maker
        </div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            {profile.displayName}
          </h1>
          {isOwner ? (
            <Link
              href="/maker/profile"
              className="font-mono text-[10px] uppercase tracking-[0.18em] underline text-black/55 hover:text-black"
            >
              Edit profile
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {verified ? <VerifiedBadge size="md" /> : null}
          <MakerRatingBadge rating={aggregate.avg !== null ? { avg: aggregate.avg, count: aggregate.count } : null} size="md" />
          {city ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
              {city}
            </span>
          ) : null}
          {primaryPrinter ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
              · {primaryPrinter.printerModel}
            </span>
          ) : null}
          {primaryPrinter?.hasAMS ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700">
              AMS
            </span>
          ) : null}
          {profile.freeCompletionPhoto ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
              Free completion photo
            </span>
          ) : null}
        </div>

        {profile.bio ? (
          <Card className="p-5 mb-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
              About
            </div>
            <p className="text-sm font-light text-black/75 whitespace-pre-wrap leading-relaxed">
              {profile.bio}
            </p>
          </Card>
        ) : null}

        {profile.printers.length > 0 ? (
          <Card className="p-5 mb-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
              Printers
            </div>
            <ul className="space-y-3">
              {profile.printers.map((p, idx) => {
                const mats = parsePrinterMaterials(p.materials);
                return (
                  <li
                    key={p.id}
                    className={
                      "rounded-lg border border-black/[0.08] p-3 " +
                      (p.active ? "" : "opacity-55")
                    }
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                      <div className="font-medium">
                        {p.displayName}
                        <span className="font-light text-black/55 ml-2 text-[13px]">
                          {p.printerModel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {idx === 0 && p.active ? (
                          <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 border border-amber-500/30">
                            Primary
                          </span>
                        ) : null}
                        {p.hasAMS ? (
                          <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700">
                            AMS
                          </span>
                        ) : null}
                        {!p.active ? (
                          <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-black/[0.04] text-black/55 border border-black/[0.08]">
                            Offline
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {mats.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {mats.map((m) => (
                          <span
                            key={m}
                            className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full border border-black/[0.08] text-black/55"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/40 mt-1">
                        Any material
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
              Reviews
            </div>
            {aggregate.avg !== null ? (
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/65 tabular-nums">
                {aggregate.avg.toFixed(2)} avg · {aggregate.count}
              </div>
            ) : null}
          </div>
          {reviews.length === 0 ? (
            <p className="text-sm font-light text-black/55">
              No reviews yet. Reviews appear here after a creator and this
              maker both submit feedback on a completed job.
            </p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-black/[0.06] p-3"
                >
                  <div className="flex items-center gap-1 mb-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={
                          n <= r.rating
                            ? "w-3.5 h-3.5 fill-amber-400 text-amber-500"
                            : "w-3.5 h-3.5 text-black/20"
                        }
                        strokeWidth={1.5}
                      />
                    ))}
                  </div>
                  {r.comment ? (
                    <p className="text-sm font-light text-black/75 whitespace-pre-wrap leading-relaxed">
                      {r.comment}
                    </p>
                  ) : null}
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mt-2">
                    {r.authorName ?? "Creator"} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
