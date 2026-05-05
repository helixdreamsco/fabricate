"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PayBidModal } from "@/components/jobs/PayBidModal";
import { MakerRatingBadge } from "@/components/jobs/MakerRatingBadge";
import { VerifiedBadge } from "@/components/jobs/VerifiedBadge";
import { formatGbp } from "@/lib/money";

type SharedCommunity = {
  id: string;
  slug: string;
  name: string;
  iconHue: number;
};

type BidRow = {
  id: string;
  priceOfferPence: number;
  etaHours: number;
  message: string | null;
  status: string;
  createdAt: string;
  maker: {
    id: string;
    displayName: string;
    bio: string | null;
    postcode: string | null;
    hasAMS: boolean;
    printerModel: string | null;
    stripeOnboarded: boolean;
    freeCompletionPhoto: boolean;
    sharedCommunities: SharedCommunity[];
    rating: { avg: number; count: number } | null;
    verified: boolean;
  };
};

export function CreatorBidPanel({
  jobId,
  bids,
  paymentMode,
  payerName,
  payerEmail,
}: {
  jobId: string;
  bids: BidRow[];
  paymentMode: "live" | "sim";
  payerName: string | null;
  payerEmail: string | null;
}) {
  const router = useRouter();
  const [acceptingId, setAcceptingId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [payingFor, setPayingFor] = React.useState<BidRow | null>(null);

  // Picked up by Next at build time / runtime via the NEXT_PUBLIC_ prefix.
  // Empty string means we'll fall back to sim flow even if the server is in
  // live mode (defensive — should never happen if env is set correctly).
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  async function accept(bid: BidRow) {
    setErr(null);
    if (paymentMode === "live") {
      if (!publishableKey) {
        setErr("Stripe publishable key missing — set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env.local.");
        return;
      }
      setPayingFor(bid);
      return;
    }
    // Sim mode: skip the modal and post directly.
    setAcceptingId(bid.id);
    try {
      const r = await fetch(`/api/jobs/${jobId}/bids/${bid.id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      router.refresh();
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <Card className="p-0">
      <div className="px-5 py-3 border-b border-black/[0.06] flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
          Bids ({bids.length})
        </div>
        {paymentMode === "sim" ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-amber-700">
            Accept = test payment captured (no real charge)
          </span>
        ) : null}
      </div>

      {bids.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm font-light text-black/55">
          No bids yet — makers will see this job in the open market.
          <br />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
            Bids usually start coming in once your job hits the open market.
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-black/[0.06]">
          {bids.map((b) => (
            <li key={b.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Link
                      href={`/makers/${b.maker.id}`}
                      className="font-medium hover:underline"
                    >
                      {b.maker.displayName}
                    </Link>
                    {b.maker.verified ? <VerifiedBadge /> : null}
                    <MakerRatingBadge rating={b.maker.rating} />
                    {b.maker.hasAMS ? (
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700">
                        AMS
                      </span>
                    ) : null}
                    {b.maker.freeCompletionPhoto ? (
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
                        Free completion photo
                      </span>
                    ) : null}
                    {b.maker.sharedCommunities.slice(0, 2).map((c) => (
                      <span
                        key={c.id}
                        className="font-mono text-[9px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full border"
                        style={{
                          background: `hsl(${c.iconHue} 70% 96%)`,
                          borderColor: `hsl(${c.iconHue} 50% 80%)`,
                          color: `hsl(${c.iconHue} 60% 30%)`,
                        }}
                        title={`From your community ‘${c.name}’`}
                      >
                        {c.name}
                      </span>
                    ))}
                    {b.maker.printerModel ? (
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45">
                        · {b.maker.printerModel}
                      </span>
                    ) : null}
                    {b.maker.postcode ? (
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45">
                        · {b.maker.postcode}
                      </span>
                    ) : null}
                  </div>
                  {b.maker.bio ? (
                    <div className="text-sm font-light text-black/65 mt-1 leading-relaxed">
                      {b.maker.bio}
                    </div>
                  ) : null}
                  {b.message ? (
                    <div className="mt-2 flex gap-2 text-sm font-light">
                      <MessageSquareText className="w-3.5 h-3.5 text-black/35 mt-0.5 shrink-0" strokeWidth={2} />
                      <span className="text-black/70 italic">{b.message}</span>
                    </div>
                  ) : null}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-xl tabular-nums">
                    {formatGbp(b.priceOfferPence)}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mt-0.5">
                    ETA {b.etaHours}h
                  </div>
                  {paymentMode === "live" && !b.maker.stripeOnboarded ? (
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-amber-700 mt-1.5 max-w-[140px]">
                      Maker not onboarded for payouts
                    </div>
                  ) : null}
                  <Button
                    size="md"
                    className="mt-2"
                    onClick={() => accept(b)}
                    disabled={acceptingId !== null || (paymentMode === "live" && !b.maker.stripeOnboarded)}
                    startIcon={<Check className="w-3 h-3" strokeWidth={2.4} />}
                  >
                    {acceptingId === b.id ? "Accepting…" : "Accept & pay"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {err ? (
        <div className="px-5 py-3 border-t border-black/[0.06] text-sm text-red-600 font-light">
          {err}
        </div>
      ) : null}

      {payingFor ? (
        <PayBidModal
          jobId={jobId}
          bidId={payingFor.id}
          amountPence={payingFor.priceOfferPence}
          publishableKey={publishableKey}
          payerName={payerName}
          payerEmail={payerEmail}
          onClose={() => setPayingFor(null)}
          onSuccess={() => {
            setPayingFor(null);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}
