import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { Card } from "@/components/ui/Card";
import { AdminVerificationActions } from "./AdminVerificationActions";

export const dynamic = "force-dynamic";

export default async function AdminVerificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/admin/verifications");
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

  const pending = await prisma.makerVerification.findMany({
    where: { status: "pending_review" },
    orderBy: { submittedAt: "asc" },
    include: {
      maker: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });

  const recent = await prisma.makerVerification.findMany({
    where: { status: { in: ["approved", "rejected"] } },
    orderBy: { reviewedAt: "desc" },
    take: 20,
    include: {
      maker: { select: { displayName: true } },
    },
  });

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1100px] mx-auto px-5 md:px-8 py-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
          Admin · Verification queue
        </div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-6">
          {pending.length} pending review
        </h1>

        <section className="space-y-4 mb-10">
          {pending.length === 0 ? (
            <Card className="p-5 text-sm font-light text-black/55">
              No pending submissions.
            </Card>
          ) : null}
          {pending.map((v) => (
            <Card key={v.id} className="p-5">
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
                <div>
                  <div className="font-medium">{v.maker.displayName}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                    {v.maker.user.email} · submitted{" "}
                    {v.submittedAt
                      ? new Date(v.submittedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
                      : "—"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/55 mb-1">
                    Identity (Stripe)
                  </div>
                  {v.stripeIdentityStatus === "verified" ? (
                    <div className="rounded-md border border-emerald-300/40 bg-emerald-50/50 px-3 py-2 text-sm font-light text-emerald-900">
                      Verified by Stripe Identity ✓
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-800 mt-1">
                        ID {v.stripeIdentityVerificationId ?? "—"}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-300/40 bg-amber-50/50 px-3 py-2 text-sm font-light text-amber-900">
                      {v.stripeIdentityStatus ?? "not started"}
                    </div>
                  )}
                </div>
                <Photo label="Calibration print" url={v.calibrationPrintUrl} />
              </div>
              <AdminVerificationActions verificationId={v.id} />
            </Card>
          ))}
        </section>

        <h2 className="text-lg font-bold mb-3">Recently decided</h2>
        <ul className="space-y-2 text-sm font-light">
          {recent.map((v) => (
            <li key={v.id} className="rounded-md border border-black/[0.06] px-3 py-2 flex items-center justify-between">
              <span>
                {v.maker.displayName}
                <span className="text-black/45 mx-1.5">·</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  {v.status}
                </span>
                {v.rejectionReason ? (
                  <span className="text-black/55 italic ml-2">{v.rejectionReason}</span>
                ) : null}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45">
                {v.reviewedAt ? new Date(v.reviewedAt).toLocaleDateString("en-GB", { dateStyle: "medium" }) : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Photo({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/55 mb-1">
        {label}
      </div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={label}
            className="rounded-md border border-black/[0.08] w-full"
            style={{ maxHeight: 200, objectFit: "cover" }}
          />
        </a>
      ) : (
        <div className="text-xs italic text-black/45">missing</div>
      )}
    </div>
  );
}
