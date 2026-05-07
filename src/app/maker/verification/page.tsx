import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { BackLink } from "@/components/shell/BackLink";
import { paymentMode } from "@/lib/payments";
import { StartIdentityButton } from "./StartIdentityButton";

export const dynamic = "force-dynamic";

export default async function MakerVerificationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/maker/verification");
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
    include: { verification: true },
  });
  if (!profile) redirect("/maker/profile");

  const v = profile.verification;
  const status = v?.status ?? "not_started";
  const idStatus = v?.stripeIdentityStatus ?? null;
  const idVerified = idStatus === "verified";
  const mode = paymentMode();

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[720px] mx-auto px-5 md:px-8 py-8">
        <BackLink href="/maker" label="Back to dashboard" />
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
          Maker · Verification
        </div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Get verified to start bidding
        </h1>
        <p className="text-sm font-light text-black/65 mb-6 leading-relaxed">
          One step. Identity is verified by Stripe (passport or driving
          licence + selfie liveness — Stripe stores the document, we never
          see it). Once Stripe confirms, you&rsquo;re approved automatically
          and can start placing bids.
        </p>

        {idVerified && status !== "rejected" ? (
          <Card className="p-5 bg-emerald-50/50 border-emerald-300/40">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-800 mb-1">
              Verified ✓
            </div>
            <p className="text-sm font-light text-emerald-900">
              Identity confirmed by Stripe. You can place bids on the open
              market.
            </p>
          </Card>
        ) : status === "rejected" ? (
          <Card className="p-5 bg-red-50/50 border-red-300/40">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-red-800 mb-1">
              Account on hold
            </div>
            <p className="text-sm font-light text-red-900">
              An admin has paused this maker account. Contact{" "}
              <a className="underline" href="mailto:support@helixdreams.co">
                support@helixdreams.co
              </a>{" "}
              if you think this is a mistake.
              {v?.rejectionReason ? (
                <span className="block mt-2 text-red-800">
                  {v.rejectionReason}
                </span>
              ) : null}
            </p>
          </Card>
        ) : (
          <div className="rounded-xl border border-black/[0.08] p-5">
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                Identity (Stripe Identity)
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] text-[10px] border bg-amber-500/10 text-amber-800 border-amber-500/30">
                {idStatus === "processing"
                  ? "Processing"
                  : idStatus === "requires_input"
                    ? "Awaiting completion"
                    : idStatus === "canceled"
                      ? "Canceled — restart"
                      : "Not started"}
              </span>
            </div>
            <p className="text-[13px] font-light text-black/65 leading-relaxed mb-3">
              Stripe handles the document scan + selfie. Accepted documents:
              passport, driving licence, ID card. The address printed on
              your driving licence (if you use one) is captured by Stripe
              and treated as your verified address.
            </p>
            <StartIdentityButton modeHint={mode} />
          </div>
        )}
      </div>
    </div>
  );
}
