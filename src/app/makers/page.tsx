"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Input } from "@/components/ui/Input";
import { formatGBP } from "@/lib/utils";

export default function MakersPage() {
  const [printer, setPrinter] = React.useState("Bambu Lab X1C");
  const [hoursPerWeek, setHoursPerWeek] = React.useState(40);
  const [submitted, setSubmitted] = React.useState(false);
  const [email, setEmail] = React.useState("");

  // Back-of-envelope earnings: avg £2.40/h machine time, 70% margin share to
  // maker = £1.68/h of print time; plus ~£1.20/h material margin pass-through
  // after filament cost.
  const weekly = hoursPerWeek * (1.68 + 1.2);
  const monthly = weekly * 4.3;

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
            earning overnight.
          </span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg md:text-xl font-light text-black/60 leading-relaxed">
          Install the Fabricate Bridge Client on the PC beside your printer.
          Jobs are auto-accepted, sliced server-side, and streamed over USB —
          you clear the bed, we pay out weekly.
        </p>
      </section>

      {/* 3 steps */}
      <section className="border-y border-black/[0.06] bg-white">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-20 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step
            idx="01"
            title="Plug in the Bridge Client"
            body="A 28 MB background app for Windows, macOS, and Linux. Installs in 60 seconds, connects over plain USB. No open ports, no cloud dependency beyond our API."
            detail="Python · runs in user session · zero config"
          />
          <Step
            idx="02"
            title="Jobs arrive auto-accepted"
            body="We slice server-side against your exact printer profile and send the G-code down the pipe. You see queued jobs, progress, and maker-side events. No chat threads, no bidding."
            detail="Server-side slicing · safety-checked G-code"
          />
          <Step
            idx="03"
            title="Clear the bed, get paid"
            body="When the print finishes, tap 'Bed cleared' on your phone or the client. Funds release from Creator escrow, typically paid out weekly on Fridays."
            detail="Stripe Connect · GBP weekly · no fees until £500/mo"
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

          {/* Apply */}
          <Card className="p-6 md:p-8 flex flex-col gap-5 bg-[#0a0a0a] text-white !border-[#0a0a0a]">
            <MonoLabel size="md" className="!text-white/60">
              Apply in 60 seconds
            </MonoLabel>
            <h3 className="text-2xl md:text-3xl font-black tracking-tight leading-[1.1]">
              Seats are opening in waves.
              <br />
              <span className="text-white/55">Reserve yours.</span>
            </h3>
            {submitted ? (
              <div className="rounded-xl border border-white/20 p-4 flex items-center gap-3">
                <StatusDot tone="ready" pulse />
                <div>
                  <div className="text-sm font-medium">
                    You&rsquo;re on the list.
                  </div>
                  <div className="text-[12px] font-light text-white/60 mt-0.5">
                    We&rsquo;ll email onboarding details for {printer} when a
                    seat opens.
                  </div>
                </div>
              </div>
            ) : (
              <form
                className="flex flex-col gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(true);
                }}
              >
                <label className="flex flex-col gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/55">
                    Email
                  </span>
                  <input
                    required
                    type="email"
                    placeholder="you@studio.co"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-transparent border-b border-white/25 pb-1.5 text-sm font-light outline-none placeholder:text-white/35 focus:border-white/70 transition-colors"
                  />
                </label>
                <Button
                  type="submit"
                  size="lg"
                  withArrow
                  variant="secondary"
                  className="w-full justify-between !bg-white !text-black !border-white"
                >
                  Reserve a seat
                </Button>
              </form>
            )}
            <div className="text-[11px] font-light text-white/55 leading-relaxed">
              No fees until you&rsquo;ve cleared £500 / month. Payouts issued
              on a weekly schedule once escrow clears.
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
    q: "Do I need a dedicated PC?",
    a: "No. The Bridge Client runs in the background on your normal machine. It uses ~80 MB of RAM and only touches the printer over USB when there's a job.",
  },
  {
    q: "What if my print fails?",
    a: "The Bridge Client streams heartbeats every 10 s. We detect failure, offer the creator a reprint at zero cost to you, and comp you for machine time up to that point.",
  },
  {
    q: "Can I set my own hours?",
    a: "Yes. Mark yourself Offline from the maker app any time and the dispatcher will route jobs elsewhere. No penalties, no quotas.",
  },
  {
    q: "How does payout work?",
    a: "Stripe Connect, scheduled weekly on Fridays in the usual flow. Funds sit in escrow until the Creator confirms pickup, then release to your balance.",
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
