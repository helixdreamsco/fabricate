"use client";
import * as React from "react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusDot } from "@/components/ui/StatusDot";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

type PrinterState = "ready" | "printing" | "offline" | "bed";

type FakePrinter = {
  id: string;
  model: string;
  location: string;
  state: PrinterState;
  progress?: number;
  eta?: string;
};

const SEED: FakePrinter[] = [
  { id: "X1C-014", model: "Bambu X1C", location: "State Tech · A1", state: "ready", eta: "Ready" },
  { id: "P2S-221", model: "Bambu P2S", location: "Northside · B3", state: "printing", progress: 62, eta: "42 min" },
  { id: "CORE-007", model: "Prusa Core One", location: "Metropolitan · A2", state: "ready", eta: "Ready" },
  { id: "MK4-113", model: "Prusa MK4S", location: "Southside · D4", state: "printing", progress: 18, eta: "2 h 10" },
  { id: "K1C-046", model: "Creality K1C", location: "East Docks · C4", state: "bed", eta: "Clearing" },
  { id: "XL-004", model: "Prusa XL", location: "Riverside · B1", state: "ready", eta: "Ready" },
  { id: "NEPT-088", model: "Elegoo Neptune 4", location: "Central Arts · A1", state: "printing", progress: 88, eta: "12 min" },
  { id: "E5-001", model: "Ender-5 Max", location: "Bay · D2", state: "offline", eta: "Offline" },
];

export function LiveFleet() {
  const [printers, setPrinters] = React.useState<FakePrinter[]>(SEED);

  // Gentle animation of the "live" fleet to sell the dashboard feel.
  React.useEffect(() => {
    const id = setInterval(() => {
      setPrinters((prev) =>
        prev.map((p) =>
          p.state === "printing" && typeof p.progress === "number"
            ? {
                ...p,
                progress: Math.min(99.5, p.progress + Math.random() * 0.8),
              }
            : p,
        ),
      );
    }, 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      id="network"
      className="bg-[#fafafa] border-y border-black/[0.06] scroll-mt-16"
    >
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <div className="flex items-end justify-between mb-10">
          <div>
            <MonoLabel size="md" className="mb-3">
              Live fleet · 00:{(new Date().getSeconds() + "").padStart(2, "0")} UTC
            </MonoLabel>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.05] max-w-xl">
              41 makers.
              <br />
              <span className="text-black/45">17 printers ready right now.</span>
            </h2>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <FleetStat label="Ready" value="17" tone="ready" />
            <FleetStat label="Printing" value="22" tone="printing" />
            <FleetStat label="Clearing" value="2" tone="warn" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {printers.map((p) => (
            <PrinterCard key={p.id} p={p} />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <MonoLabel size="sm">Heartbeat · updated every 10 s</MonoLabel>
          <MonoLabel size="sm">
            {printers.length} of 41 shown
          </MonoLabel>
        </div>
      </div>
    </section>
  );
}

function FleetStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ready" | "printing" | "warn";
}) {
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-2">
        <StatusDot tone={tone} pulse={tone !== "warn"} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
          {label}
        </span>
      </div>
      <span className="font-mono text-2xl font-bold tabular-nums mt-1">
        {value}
      </span>
    </div>
  );
}

function PrinterCard({ p }: { p: FakePrinter }) {
  const tone =
    p.state === "ready"
      ? "ready"
      : p.state === "printing"
        ? "printing"
        : p.state === "bed"
          ? "warn"
          : "offline";
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-black/40">
            {p.id}
          </div>
          <div className="text-sm font-medium mt-0.5">{p.model}</div>
        </div>
        <StatusDot tone={tone} pulse={p.state === "printing"} />
      </div>
      <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-black/50">
        {p.location}
      </div>
      {p.state === "printing" && typeof p.progress === "number" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
            <span>{p.progress.toFixed(0)}%</span>
            <span>{p.eta}</span>
          </div>
          <ProgressBar value={p.progress} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
            {p.eta}
          </span>
          {p.state === "ready" ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#10b981]">
              Accepting
            </span>
          ) : null}
        </div>
      )}
    </Card>
  );
}
