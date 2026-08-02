import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDesignIdentity, ownerWhere } from "@/lib/design/identity";
import { getTemplate } from "@/lib/design/registry";
import { indicativeQuote } from "@/lib/design/jobs";
import type { DesignMetrics } from "@/lib/design/pyapi";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Button } from "@/components/ui/Button";
import { PrintabilityBadge } from "@/components/design/DesignJobStatus";
import { DesignHandoffButton } from "@/components/design/DesignHandoffButton";

export const metadata: Metadata = {
  title: "Your designs — Fabricate",
  description: "Every model you've made. Download the STL or send it to a maker.",
};

export const dynamic = "force-dynamic";

const MAX_SHOWN = 60;

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Everything this owner has made.
 *
 * Designs used to exist only in the tab that made them: the model was built,
 * quoted and then unreachable the moment you navigated away, even though the
 * job row and its artifacts were still on disk. That pushed people into
 * ordering there and then, when plenty just want the file.
 *
 * Works for guests too — ownership is the same signed anonymous cookie that
 * created the design, so a signed-out visitor keeps their work.
 */
export default async function MyDesignsPage() {
  const identity = await getDesignIdentity();
  const jobs = await prisma.designJob.findMany({
    where: { ...ownerWhere(identity), state: "ready", stlKey: { not: null } },
    orderBy: { createdAt: "desc" },
    take: MAX_SHOWN,
  });

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-8 px-5 pb-24 pt-12 md:px-8 md:pt-[72px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <MonoLabel size="xs" className="mb-3 block">
            Yours to keep · download or print
          </MonoLabel>
          <h1 className="m-0 text-[32px] font-bold leading-[1.05] tracking-[-0.02em] text-black md:text-[40px]">
            Your designs
          </h1>
        </div>
        <Link href="/design">
          <Button variant="secondary">Make another</Button>
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 px-6 py-14 text-center">
          <p className="m-0 text-sm font-light text-black/55">
            Nothing here yet — the models you make will show up on this page.
          </p>
          <Link href="/design" className="mt-4 inline-block">
            <Button withArrow>Design something</Button>
          </Link>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => {
            const metrics = (job.metricsJson ?? null) as DesignMetrics | null;
            const spec = job.templateId ? getTemplate(job.templateId) : undefined;
            const title =
              spec?.name ??
              (job.prompt ? job.prompt.slice(0, 60) : "AI creation");
            const quote = metrics ? indicativeQuote(metrics, job.quantity) : null;

            return (
              <li
                key={job.id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-black/[0.08] bg-white p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="m-0 text-sm font-medium text-black">{title}</p>
                    <MonoLabel size="xs" className="shrink-0">
                      {job.createdAt.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </MonoLabel>
                  </div>
                  <MonoLabel size="xs" className="mt-1 block">
                    {job.kind === "ai" ? "AI" : "Template"}
                    {job.quantity > 1 ? ` · ${job.quantity} units` : ""}
                  </MonoLabel>

                  {job.badge ? (
                    <div className="mt-3">
                      <PrintabilityBadge
                        badge={job.badge as "ready" | "needs_supports" | "too_fragile"}
                      />
                    </div>
                  ) : null}

                  {metrics ? (
                    <MonoLabel size="xs" className="mt-3 block">
                      {metrics.bboxMm.map((v) => Math.round(v)).join(" × ")} mm ·{" "}
                      {formatTime(metrics.printTimeS)} · {metrics.filamentG.toFixed(0)} g
                    </MonoLabel>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Download is the equal partner of ordering here, not a
                      footnote under a call to action. */}
                  <a href={`/api/design/files/${job.stlKey}`} download>
                    <Button variant="secondary">Download STL</Button>
                  </a>
                  <DesignHandoffButton
                    stlUrl={`/api/design/files/${job.stlKey}`}
                    fileName={`${job.templateId ?? "fabricate-design"}.stl`}
                    quantity={job.quantity}
                    label="Print this"
                  />
                  {quote ? (
                    <MonoLabel size="xs" className="ml-auto">
                      ~£{quote.total.toFixed(2)}
                    </MonoLabel>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {jobs.length >= MAX_SHOWN ? (
        <MonoLabel size="xs" className="block">
          Showing your {MAX_SHOWN} most recent designs.
        </MonoLabel>
      ) : null}
    </main>
  );
}
