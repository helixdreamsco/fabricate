"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Bookmark, EyeOff, Eye, Sliders } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { formatGbp, poundsToPence } from "@/lib/money";

type MyBid = {
  bidId: string;
  priceOfferPence: number;
  etaHours: number;
  message: string | null;
  status: string;
};

/**
 * Maker-side decision panel for an OPEN job.
 *
 * Gives three clear actions, in order of expected use:
 *   1. **Accept at £X** — 1-click bid at the creator's quoted price with a
 *      sensible default ETA. The creator still picks among bidders, but
 *      this is the "yes, I'll do it for what they asked" path.
 *   2. **Custom bid** — expand inline to set price / ETA / message
 *      (negotiate down or up).
 *   3. **Save / Decline** — bookmark for later or hide from the market view.
 *
 * If the maker already has a bid in flight we show its status + edit/withdraw.
 */
export function MakerBidPanel({
  jobId,
  quotedPricePence,
  myBid,
  onboarded,
  initialBookmark,
}: {
  jobId: string;
  quotedPricePence: number;
  myBid: MyBid | null;
  onboarded: boolean;
  initialBookmark: "SAVED" | "HIDDEN" | null;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"summary" | "custom">(
    myBid ? "custom" : "summary",
  );
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [bookmark, setBookmark] = React.useState<"SAVED" | "HIDDEN" | null>(initialBookmark);

  // Custom-bid inputs
  const [pricePounds, setPricePounds] = React.useState(
    myBid ? (myBid.priceOfferPence / 100).toFixed(2) : (quotedPricePence / 100).toFixed(2),
  );
  const [etaHours, setEtaHours] = React.useState(myBid ? String(myBid.etaHours) : "24");
  const [message, setMessage] = React.useState(myBid?.message ?? "");

  async function placeBid(args: { priceOfferPence: number; etaHours: number; message: string | null }) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/bids`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function acceptAtQuoted() {
    await placeBid({
      priceOfferPence: quotedPricePence,
      etaHours: 24,
      message: null,
    });
  }

  async function submitCustom() {
    const priceOfferPence = poundsToPence(parseFloat(pricePounds));
    if (!Number.isFinite(priceOfferPence) || priceOfferPence <= 0) {
      setErr("Enter a valid price");
      return;
    }
    const eta = parseInt(etaHours, 10);
    if (!Number.isFinite(eta) || eta <= 0) {
      setErr("Enter a valid ETA in hours");
      return;
    }
    await placeBid({ priceOfferPence, etaHours: eta, message: message || null });
  }

  async function withdraw() {
    if (!myBid) return;
    if (!confirm("Withdraw your bid?")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/bids/${myBid.bidId}/withdraw`, {
        method: "POST",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setBm(status: "SAVED" | "HIDDEN" | null) {
    const prev = bookmark;
    setBookmark(status);
    try {
      const r = await fetch(`/api/jobs/${jobId}/bookmark`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) setBookmark(prev);
    } catch {
      setBookmark(prev);
    }
  }

  // Already bid: show status card with edit/withdraw + secondary actions.
  if (myBid && myBid.status === "PENDING" && mode !== "custom") {
    return (
      <Card className="p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
          You bid on this job
        </div>
        <div className="flex items-baseline gap-3 flex-wrap mb-3">
          <div className="text-2xl font-black tabular-nums">
            {formatGbp(myBid.priceOfferPence)}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/55">
            ETA {myBid.etaHours}h
          </div>
        </div>
        {myBid.message ? (
          <div className="text-sm font-light text-black/65 italic mb-3">
            “{myBid.message}”
          </div>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="md" variant="secondary" onClick={() => setMode("custom")}>
            Edit bid
          </Button>
          <Button size="md" variant="ghost" onClick={withdraw} disabled={busy}>
            Withdraw
          </Button>
          <SecondaryActions bookmark={bookmark} onChange={setBm} />
        </div>
        {err ? <div className="text-sm text-red-600 font-light mt-3">{err}</div> : null}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      {!onboarded ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs font-light text-amber-900 leading-relaxed">
          You can place a bid now, but to actually be picked you&rsquo;ll need to{" "}
          <Link href="/maker/payouts" className="underline">connect payouts</Link> first.
        </div>
      ) : null}

      {mode === "summary" ? (
        <>
          {/* Primary CTA: accept at quoted price */}
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-1">
            Quoted price
          </div>
          <div className="flex items-baseline gap-3 mb-4">
            <div className="text-3xl font-black tabular-nums">
              {formatGbp(quotedPricePence)}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/45">
              Creator&rsquo;s asking price
            </div>
          </div>
          <Button
            size="xl"
            withArrow
            className="w-full mb-2"
            onClick={acceptAtQuoted}
            disabled={busy}
            startIcon={<Check className="w-3.5 h-3.5 mr-1" strokeWidth={2.4} />}
          >
            {busy ? "Placing…" : `Accept at ${formatGbp(quotedPricePence)}`}
          </Button>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/45 leading-relaxed mb-3">
            Places a bid at the quoted price with a 24h default ETA. The
            creator still picks among bidders. You can withdraw any time
            before they accept.
          </p>

          <button
            type="button"
            onClick={() => setMode("custom")}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black inline-flex items-center gap-1.5"
          >
            <Sliders className="w-3 h-3" strokeWidth={2.2} /> Or place a custom bid →
          </button>

          <div className="mt-4 pt-4 border-t border-black/[0.06] flex items-center gap-2 flex-wrap">
            <SecondaryActions bookmark={bookmark} onChange={setBm} />
          </div>

          {err ? <div className="text-sm text-red-600 font-light mt-3">{err}</div> : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
              {myBid ? "Edit your bid" : "Custom bid"}
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("summary");
                setErr(null);
              }}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black"
            >
              ← Back
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <Field
              label="Your price (£)"
              hint="What you'll do the job for. Creator can still pick a cheaper bid."
            >
              <input
                type="number"
                min={0.5}
                step={0.5}
                inputMode="decimal"
                value={pricePounds}
                onChange={(e) => setPricePounds(e.target.value)}
                className="bg-transparent w-full border-b border-black/15 pb-1.5 text-base font-light outline-none focus:border-black/50 transition-colors"
              />
            </Field>
            <Field
              label="ETA (hours)"
              hint="From accept → ready for pickup. Includes queue + print + post-processing."
            >
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={etaHours}
                onChange={(e) => setEtaHours(e.target.value)}
                className="bg-transparent w-full border-b border-black/15 pb-1.5 text-base font-light outline-none focus:border-black/50 transition-colors"
              />
            </Field>
          </div>
          <Field label="Message (optional)">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything the creator should know — printer, post-processing, when you can start."
              className="w-full bg-transparent border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[64px]"
              maxLength={1000}
            />
          </Field>
          {err ? <div className="text-sm text-red-600 font-light mt-3">{err}</div> : null}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Button size="lg" withArrow onClick={submitCustom} disabled={busy}>
              {busy ? "Submitting…" : myBid ? "Update bid" : "Place bid"}
            </Button>
            {myBid && myBid.status === "PENDING" ? (
              <Button size="md" variant="ghost" onClick={withdraw} disabled={busy}>
                Withdraw
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

function SecondaryActions({
  bookmark,
  onChange,
}: {
  bookmark: "SAVED" | "HIDDEN" | null;
  onChange: (s: "SAVED" | "HIDDEN" | null) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onChange(bookmark === "SAVED" ? null : "SAVED")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-[0.16em] border transition-colors",
          bookmark === "SAVED"
            ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
            : "bg-white text-black/65 border-black/15 hover:border-black/40",
        )}
      >
        <Bookmark
          className={cn("w-3 h-3", bookmark === "SAVED" && "fill-current")}
          strokeWidth={2.2}
        />
        {bookmark === "SAVED" ? "Saved" : "Save for later"}
      </button>
      <button
        type="button"
        onClick={() => onChange(bookmark === "HIDDEN" ? null : "HIDDEN")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-[0.16em] border transition-colors",
          bookmark === "HIDDEN"
            ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
            : "bg-white text-black/65 border-black/15 hover:border-black/40",
        )}
      >
        {bookmark === "HIDDEN" ? (
          <Eye className="w-3 h-3" strokeWidth={2.2} />
        ) : (
          <EyeOff className="w-3 h-3" strokeWidth={2.2} />
        )}
        {bookmark === "HIDDEN" ? "Unhide" : "Not interested"}
      </button>
    </>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 block mb-1.5">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block mt-1 text-[11px] font-light text-black/50 leading-snug">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
