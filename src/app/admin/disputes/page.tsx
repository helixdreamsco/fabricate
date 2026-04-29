import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { Card } from "@/components/ui/Card";
import { formatGbp } from "@/lib/money";
import { AdminResolveDisputeForm } from "./AdminResolveDisputeForm";

export const dynamic = "force-dynamic";

export default async function AdminDisputesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/admin/disputes");
  if (!isAdminEmail(session.user.email)) {
    return (
      <div className="flex-1 bg-grid-none">
        <div className="max-w-[720px] mx-auto px-5 md:px-8 py-10 text-center">
          <h1 className="text-2xl font-bold mb-3">Forbidden</h1>
          <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.18em] underline">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  const open = await prisma.dispute.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    include: {
      filedBy: { select: { name: true, email: true } },
      job: {
        include: {
          assignedMaker: { select: { displayName: true } },
          payment: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true, email: true } } },
      },
    },
  });

  const resolved = await prisma.dispute.findMany({
    where: { status: { in: ["RESOLVED_CREATOR", "RESOLVED_MAKER"] } },
    orderBy: { resolvedAt: "desc" },
    take: 20,
    include: {
      filedBy: { select: { name: true, email: true } },
      job: { select: { id: true, fileName: true } },
    },
  });

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1100px] mx-auto px-5 md:px-8 py-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
          Admin · Dispute queue
        </div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-6">
          {open.length} open · {resolved.length} recent
        </h1>

        <section className="space-y-4 mb-10">
          {open.length === 0 ? (
            <Card className="p-5 text-sm font-light text-black/55">
              No open disputes. 🎉
            </Card>
          ) : null}
          {open.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                    Job <Link href={`/jobs/${d.job.id}`} className="underline">{d.job.fileName}</Link>
                  </div>
                  <div className="text-[12px] font-light text-black/65 mt-0.5">
                    Filed by {d.filedBy.name ?? d.filedBy.email} ·{" "}
                    {new Date(d.createdAt).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 tabular-nums">
                  {d.job.payment ? formatGbp(d.job.payment.amountPence) : "no payment"}
                </div>
              </div>

              <div className="rounded-md border border-black/[0.08] bg-amber-50/40 p-3 mb-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1">
                  Reason
                </div>
                <div className="text-sm font-light text-black/80 whitespace-pre-wrap">
                  {d.reason}
                </div>
              </div>

              {d.messages.length > 0 ? (
                <details className="mb-3">
                  <summary className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 cursor-pointer">
                    {d.messages.length} message{d.messages.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {d.messages.map((m) => (
                      <li key={m.id} className="rounded-md bg-black/[0.02] border border-black/[0.06] p-2">
                        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mb-0.5">
                          {m.author.name ?? m.author.email} · {new Date(m.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                        </div>
                        <div className="text-sm font-light text-black/75 whitespace-pre-wrap">{m.body}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <AdminResolveDisputeForm
                disputeId={d.id}
                paymentAmountPence={d.job.payment?.amountPence ?? 0}
                hasPayment={!!d.job.payment}
              />
            </Card>
          ))}
        </section>

        <h2 className="text-lg font-bold mb-3">Recently resolved</h2>
        <ul className="space-y-2 text-sm font-light">
          {resolved.map((d) => (
            <li key={d.id} className="rounded-md border border-black/[0.06] px-3 py-2 flex items-center justify-between">
              <span>
                <Link href={`/jobs/${d.job.id}`} className="underline">{d.job.fileName}</Link>
                <span className="text-black/45 mx-1.5">·</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  {d.status === "RESOLVED_CREATOR" ? "Creator won" : "Maker won"}
                </span>
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45">
                {d.resolvedAt ? new Date(d.resolvedAt).toLocaleDateString("en-GB", { dateStyle: "medium" }) : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
