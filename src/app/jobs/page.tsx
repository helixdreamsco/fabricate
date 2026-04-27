import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/jobs/StatusPill";
import { TestModeBadge } from "@/components/jobs/TestModeBadge";
import { paymentMode } from "@/lib/payments";
import { formatGbp } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function MyJobsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/jobs");

  const jobs = await prisma.job.findMany({
    where: { creatorId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      assignedMaker: { select: { displayName: true } },
      _count: { select: { bids: true } },
    },
  });

  const mode = paymentMode();

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1100px] mx-auto px-5 md:px-8 py-8 md:py-10">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2 flex items-center gap-3 flex-wrap">
              <span>My jobs</span>
              {mode === "sim" ? <TestModeBadge /> : null}
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
              {jobs.length === 0 ? "No jobs yet." : `${jobs.length} job${jobs.length === 1 ? "" : "s"}.`}
            </h1>
          </div>
          <Link href="/">
            <Button size="md" withArrow startIcon={<Plus className="w-3 h-3" strokeWidth={2.4} />}>
              New job
            </Button>
          </Link>
        </div>

        {jobs.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 mb-2">
              Start by uploading an STL
            </div>
            <p className="text-sm font-light text-black/55 max-w-md mx-auto leading-relaxed">
              Upload your part on the home page, configure print settings, and
              post it to the open market. Makers will bid; you pick.
            </p>
            <Link href="/" className="inline-block mt-4">
              <Button size="lg" withArrow>Upload a part</Button>
            </Link>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-black/[0.06]">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-black/[0.02] transition-colors flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{j.fileName}</div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45 mt-0.5 truncate">
                        Posted {new Date(j.createdAt).toLocaleString("en-GB", {
                          dateStyle: "medium", timeStyle: "short",
                        })}
                        {j.assignedMaker ? ` · ${j.assignedMaker.displayName}` : ""}
                        {j.status === "OPEN" ? ` · ${j._count.bids} bid${j._count.bids === 1 ? "" : "s"}` : ""}
                      </div>
                    </div>
                    <StatusPill status={j.status} />
                    <div className="text-right shrink-0 min-w-[80px]">
                      <div className="font-bold tabular-nums">
                        {formatGbp(j.quotedPricePence)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
