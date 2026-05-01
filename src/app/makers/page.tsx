"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatGBP } from "@/lib/utils";

export default function MakersPage() {
  const [printer, setPrinter] = React.useState("Bambu Lab X1C");
  const [hoursPerWeek, setHoursPerWeek] = React.useState(40);
  const [submitted, setSubmitted] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Rough earnings model on the bid-based flow:
  // - £2.40/h machine time, after 8% platform cut and the auto-estimate
  //   margin multiplier the maker takes ~£1.68/h of print time
  // - ~£1.20/h material margin pass-through after filament cost
  // - assume 70% bid-win rate on jobs you bid on (the rest go to faster /
  //   cheaper / better-reviewed makers)
  const winRate = 0.7;
  const weekly = hoursPerWeek * (1.68 + 1.2) * winRate;
  const monthly = weekly * 4.3;

  const onAutoPrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, kind: "auto_print" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `failed (${res.status})`);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex-1 bg-grid-none">
      {/* Hero */}
      <section className="max-w-[1400px] mx-auto px-5 md:px-8 pt-12 md:pt-20 pb-10">
        <MonoLabel size="md" className="mb-6 block">
          For makers · bring your own printer
        </MonoLabel>
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95] max-w-5xl">
          <span className="shimmer-text">Your idle printer,</span>
          <br />
          <span className="shimmer-text" style={{ animationDelay: "0.8s" }}>
            earning between projects.
          </span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg md:text-xl font-light text-black/60 leading-relaxed">
          List your printer in five minutes. Browse open jobs nearby, bid the
          price you want, print, hand off to the customer, and get paid.
          Stripe Connect, GBP weekly payouts, no monthly fees.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/maker/profile">
            <Button size="lg" withArrow>
              Get started
            </Button>
          </Link>
          <Link href="#estimator">
            <Button size="lg" variant="secondary">
              See what you&rsquo;d earn
            </Button>
          </Link>
        </div>
      </section>

      {/* 3 steps */}
      <section className="border-y border-black/[0.06] bg-white">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-20 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step
            idx="01"
            title="List your printer · verify in 48h"
            body="Sign up, tell us your printer model, AMS status, materials in stock, and your postcode. Stripe Identity scans your passport or driving licence (5 min). Upload a photo of a recent calibration print so an admin can confirm your printer is dialled in. Approval typically lands the next working day."
            detail="Stripe Identity · admin review · ICO-registered"
          />
          <Step
            idx="02"
            title="Bid on real jobs"
            body="Browse open jobs in your area. Each one shows the file, material, quantity, infill, and the creator's quoted price. Place a bid at the price you want — you can go below the listed price to win on price, but the platform fee floor protects our cut so you only erode your machine-time and material money. Creators pick from bids on price, ETA, reviews, and community membership."
            detail="Open market · creator picks the bid · withdraw anytime"
          />
          <Step
            idx="03"
            title="Print, hand off, get paid"
            body="Once your bid is accepted, the job moves to your dashboard. Chat with the creator, print, post-process, and mint a pickup QR when ready. The creator scans on collection, payment captures, and your share lands in your Stripe Connect balance."
            detail="In-person pickup · QR handshake · weekly payouts"
          />
        </div>
      </section>

      {/* Earnings estimator */}
      <section
        id="estimator"
        className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-24 scroll-mt-16"
      >
        <div className="flex items-end justify-between mb-10">
          <div>
            <MonoLabel size="md" className="mb-3">
              Earnings estimator
            </MonoLabel>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.05] max-w-xl">
              Pick your printer.
              <br />
              <span className="text-black/45">See what it&rsquo;d earn.</span>
            </h2>
            <p className="mt-3 max-w-md text-sm font-light text-black/55 leading-relaxed">
              Rough indicator only — actual earnings depend on the bids you
              win. Assumes a 70% win rate on jobs you bid on.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-6">
          <Card className="p-6 md:p-8 flex flex-col gap-6">
            <div>
              <MonoLabel size="md" className="mb-3 block">
                Printer
              </MonoLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRINTERS.map((p) => {
                  const active = p === printer;
                  return (
                    <button
                      key={p}
                      onClick={() => setPrinter(p)}
                      className={
                        "px-3 py-2.5 rounded-lg border text-left transition-all text-[12px] font-medium " +
                        (active
                          ? "border-[#0a0a0a] bg-[#0a0a0a] text-white"
                          : "border-black/10 hover:border-black/30 bg-white")
                      }
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <MonoLabel size="md">Active hours / week</MonoLabel>
                <span className="font-mono text-sm font-bold tabular-nums">
                  {hoursPerWeek} h
                </span>
              </div>
              <input
                type="range"
                className="thin"
                min={5}
                max={120}
                step={5}
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(Number(e.target.value))}
              />
              <div className="flex justify-between mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-black/35">
                <span>Hobby · 5 h</span>
                <span>Side hustle · 40 h</span>
                <span>Pro farm · 120 h</span>
              </div>
            </div>

            <div className="pt-5 border-t border-black/[0.08] grid grid-cols-2 gap-6">
              <Metric label="Per week" value={formatGBP(weekly)} />
              <Metric label="Per month" value={formatGBP(monthly)} />
            </div>
          </Card>

          {/* Auto-print trial signup */}
          <Card className="p-6 md:p-8 flex flex-col gap-5 bg-[#7c3aed] text-white !border-[#7c3aed]">
            <MonoLabel size="md" className="!text-white/65">
              Coming soon · auto-print trial
            </MonoLabel>
            <h3 className="text-2xl md:text-3xl font-black tracking-tight leading-[1.1]">
              Skip bidding. Jobs route themselves.
            </h3>
            <p className="text-[13px] font-light text-white/80 leading-relaxed">
              We&rsquo;re building a Bridge Client — a small background app
              that runs next to your printer. Creators pay; we slice
              server-side against your printer profile and stream G-code
              over USB. You clear the bed and get paid. No bidding, no
              chat, no waiting.
            </p>
            <p className="text-[13px] font-light text-white/80 leading-relaxed">
              Limited trial spots opening later this year. Drop your email
              to be first in.
            </p>
            {submitted ? (
              <div className="rounded-xl border border-white/25 p-4 flex items-center gap-3">
                <StatusDot tone="ready" pulse />
                <div>
                  <div className="text-sm font-medium">
                    You&rsquo;re on the list.
                  </div>
                  <div className="text-[12px] font-light text-white/75 mt-0.5">
                    We&rsquo;ll email auto-print onboarding details for{" "}
                    {printer} when a slot opens.
                  </div>
                </div>
              </div>
            ) : (
              <form className="flex flex-col gap-3" onSubmit={onAutoPrintSubmit}>
                <label className="flex flex-col gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/65">
                    Email
                  </span>
                  <input
                    required
                    type="email"
                    placeholder="you@studio.co"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-transparent border-b border-white/30 pb-1.5 text-sm font-light outline-none placeholder:text-white/40 focus:border-white/80 transition-colors"
                  />
                </label>
                {error ? (
                  <div className="text-xs text-white/90 font-light">{error}</div>
                ) : null}
                <Button
                  type="submit"
                  size="lg"
                  withArrow
                  variant="secondary"
                  disabled={pending}
                  className="w-full justify-between !bg-white !text-[#7c3aed] !border-white"
                >
                  {pending ? "Adding…" : "Join the auto-print trial"}
                </Button>
              </form>
            )}
            <div className="text-[11px] font-light text-white/65 leading-relaxed">
              Auto-print is in active development. Until then, bid-based
              earnings start the day you&rsquo;re verified.
            </div>
          </Card>
        </div>
      </section>

      {/* FAQ strip */}
      <section className="max-w-[1400px] mx-auto px-5 md:px-8 pb-20">
        <MonoLabel size="md" className="mb-6 block">
          Common questions
        </MonoLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQ.map((f) => (
            <Card key={f.q} className="p-6">
              <div className="font-bold text-sm mb-2">{f.q}</div>
              <p className="text-sm font-light text-black/60 leading-relaxed">
                {f.a}
              </p>
            </Card>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors"
          >
            ← Back to Fabricate
          </Link>
        </div>
      </section>
    </div>
  );
}

const PRINTERS = [
  "Bambu Lab X1C",
  "Bambu Lab P2S",
  "Prusa MK4S",
  "Prusa Core One",
  "Creality K1C",
  "Prusa XL",
];

const FAQ = [
  {
    q: "What does verification involve?",
    a: "Stripe Identity (passport or driving licence + selfie liveness, ~5 min on a hosted page) plus a photo of a recent calibration print you've made. An admin reviews the print and either approves or asks for a better one. We never see your ID — Stripe holds it.",
  },
  {
    q: "How does pricing work?",
    a: "We auto-estimate a fair price for each job (material + machine time + a margin). Creators set their own price at or above that floor. From there it's a conversation — makers respond with their own offers: match the listed price, sharpen it to win the job, or counter higher when the file's trickier than it looks. Creators see every offer side by side and pick the maker they want to print with. The platform fee stays fixed; everything else is between you and the creator.",
  },
  {
    q: "What if a print fails or there's a dispute?",
    a: "Built-in dispute flow. The creator files an issue from the job page with photos; both sides chat and post evidence. An admin resolves it in either direction — full or partial refund (creator wins, your payout reduced) or marked complete (maker wins). Test-strip stencils with the order's unique code are available to prove your printer is working — a creator-paid add-on at checkout, or you can offer one preemptively.",
  },
  {
    q: "Do I need a dedicated PC?",
    a: "Not in the current bid-based flow — you handle each job manually from your dashboard. The auto-print trial (sign up above) will use a small Bridge Client that runs in the background, but that's coming later this year.",
  },
  {
    q: "Can I run multiple printers?",
    a: "One maker profile per printer for now. Use the same Google account; we'll add multi-printer profiles when there's enough demand to do it properly.",
  },
  {
    q: "How does payout work?",
    a: "Stripe Connect Express — the standard for marketplaces. The creator pays at bid acceptance and the funds sit in escrow; once they've collected the print and you've minted the pickup QR they scan, your share releases automatically and lands in your Stripe balance, paid out weekly on Fridays.",
  },
  {
    q: "Can I set my own hours?",
    a: "Yes — you choose which jobs to bid on. Skip anything you can't fit, materials you don't stock, or just sit out for a week. There are no quotas, no minimum jobs per month, no penalties for going quiet.",
  },
  {
    q: "What about reviews?",
    a: "After a job is COMPLETED, both creator and maker can leave a 1–5 star + comment review. Reveal-on-both: neither sees the other's review until both have submitted, or 14 days have passed. Aggregate rating shows on bid lists and your public profile.",
  },
];

function Step({
  idx,
  title,
  body,
  detail,
}: {
  idx: string;
  title: string;
  body: string;
  detail: string;
}) {
  return (
    <Card className="p-6 md:p-8 flex flex-col gap-5 min-h-[320px]">
      <div className="flex items-start justify-between">
        <div className="font-mono text-[40px] font-bold leading-none tracking-tight text-[#0a0a0a]">
          {idx}
        </div>
        <div className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a]" />
        </div>
      </div>
      <h3 className="text-2xl md:text-3xl font-black tracking-tight leading-[1.1]">
        {title}
      </h3>
      <p className="text-sm font-light text-black/60 leading-relaxed flex-1">
        {body}
      </p>
      <div className="pt-4 border-t border-black/[0.06] font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
        {detail}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/40">
        {label}
      </span>
      <span className="font-black tracking-tight text-4xl tabular-nums mt-1">
        {value}
      </span>
    </div>
  );
}
