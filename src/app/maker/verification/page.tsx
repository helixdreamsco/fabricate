import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { paymentMode } from "@/lib/payments";
import { StartIdentityButton } from "./StartIdentityButton";
import { CalibrationUploadForm } from "./CalibrationUploadForm";

export const dynamic = "force-dynamic";

export default async function MakerVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/maker/verification");
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    include: { verification: true },
  });
  if (!profile) redirect("/maker/profile");
  const sp = await searchParams;

  const v = profile.verification;
  const status = v?.status ?? "not_started";
  const idStatus = v?.stripeIdentityStatus ?? null;
  const idVerified = idStatus === "verified";
  const calibrationUploaded = !!v?.calibrationPrintUrl;
  const mode = paymentMode();

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[720px] mx-auto px-5 md:px-8 py-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
          Maker · Verification
        </div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Get verified to start bidding
        </h1>
        <p className="text-sm font-light text-black/65 mb-6 leading-relaxed">
          Two steps. Identity is verified by Stripe (passport or driving
          licence + selfie liveness — Stripe stores the document, we never
          see it). Then upload a photo of a calibration print so an admin
          can confirm your printer is dialled in. Both must pass before you
          can place bids.
        </p>

        {sp.verified ? (
          <Card className="p-4 mb-4 bg-emerald-50/50 border-emerald-300/40">
            <p className="text-sm font-light text-emerald-900">
              Identity verified ✓ — now upload a calibration print below.
            </p>
          </Card>
        ) : null}

        {status === "approved" ? (
          <Card className="p-5 bg-emerald-50/50 border-emerald-300/40">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-800 mb-1">
              Verified ✓
            </div>
            <p className="text-sm font-light text-emerald-900">
              Both identity and calibration print are approved. You can place
              bids on the open market.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            <Step
              n={1}
              title="Identity (Stripe Identity)"
              done={idVerified}
              tag={
                idVerified
                  ? "Verified ✓"
                  : idStatus === "processing"
                    ? "Processing"
                    : idStatus === "requires_input"
                      ? "Awaiting completion"
                      : idStatus === "canceled"
                        ? "Canceled — restart"
                        : "Not started"
              }
            >
              <p className="text-[13px] font-light text-black/65 leading-relaxed mb-3">
                Stripe handles the document scan + selfie. Accepted documents:
                passport, driving licence, ID card. The address printed on
                your driving licence (if you use one) is captured by Stripe
                and is treated as your verified address.
              </p>
              {!idVerified ? (
                <StartIdentityButton modeHint={mode} />
              ) : null}
            </Step>

            <Step
              n={2}
              title="Calibration print"
              done={calibrationUploaded && status !== "rejected"}
              tag={
                status === "pending_review"
                  ? "Pending admin review"
                  : status === "rejected"
                    ? "Rejected — re-upload"
                    : calibrationUploaded
                      ? "Uploaded"
                      : idVerified
                        ? "Ready"
                        : "Locked"
              }
              locked={!idVerified}
            >
              <p className="text-[13px] font-light text-black/65 leading-relaxed mb-3">
                Upload a clear photo of a recent test print (a 20mm cube,
                Benchy, or any reference print is fine). Helps an admin
                confirm your printer is producing clean parts before you
                take customer jobs.
              </p>
              {status === "rejected" && v?.rejectionReason ? (
                <div className="rounded-md border border-red-300/40 bg-red-50/50 p-3 mb-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-red-800 mb-1">
                    Previous submission rejected
                  </div>
                  <p className="text-sm font-light text-red-900">
                    {v.rejectionReason}
                  </p>
                </div>
              ) : null}
              {idVerified && status !== "approved" ? (
                <CalibrationUploadForm
                  initialUrl={v?.calibrationPrintUrl ?? null}
                  alreadySubmitted={status === "pending_review"}
                />
              ) : null}
            </Step>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  tag,
  locked,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  tag: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const tone = done ? "emerald" : locked ? "neutral" : "amber";
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-800 border-emerald-500/30"
      : tone === "amber"
        ? "bg-amber-500/10 text-amber-800 border-amber-500/30"
        : "bg-black/[0.04] text-black/55 border-black/[0.08]";
  return (
    <div className={`rounded-xl border border-black/[0.08] p-5 ${locked ? "opacity-60" : ""}`}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
          Step {n} · {title}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] text-[10px] border ${cls}`}
        >
          {tag}
        </span>
      </div>
      {children}
    </div>
  );
}
