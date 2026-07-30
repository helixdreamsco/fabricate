"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardSection } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusDot } from "@/components/ui/StatusDot";
import { savePendingUpload, savePendingHints } from "@/lib/order-storage";
import type { DesignJobView } from "@/hooks/useDesignJob";

const STATE_COPY: Record<string, string> = {
  queued: "Queued…",
  moderating: "Checking your prompt…",
  generating: "Dreaming up your model…",
  downloading: "Fetching your model…",
  processing: "Repairing + print-checking…",
};

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function PrintabilityBadge({
  badge,
}: {
  badge: NonNullable<DesignJobView["badge"]>;
}) {
  if (badge === "too_fragile") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-[#ef4444]/25 bg-[#ef4444]/10 px-3 py-1">
        <StatusDot tone="warn" />
        <MonoLabel size="sm" muted={false} className="text-[#ef4444]">
          Too fragile — scale up or regenerate
        </MonoLabel>
      </span>
    );
  }
  if (badge === "needs_supports") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-3 py-1">
        <StatusDot tone="warn" />
        <MonoLabel size="sm" muted={false} className="text-[#b45309]">
          Needs supports · adds cost
        </MonoLabel>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#10b981]/25 bg-[#10b981]/10 px-3 py-1">
      <StatusDot tone="ready" />
      <MonoLabel size="sm" muted={false} className="text-[#047857]">
        Ready to print
      </MonoLabel>
    </span>
  );
}

/**
 * Job progress + result card. On "Continue to quote" the finished STL is
 * stashed exactly like a homepage upload (savePendingUpload) and the user
 * lands in the standard /configure flow — same quote, same checkout.
 */
export function DesignJobStatus({
  job,
  error,
  fileName,
}: {
  job: DesignJobView | null;
  error: string | null;
  fileName: string;
}) {
  const router = useRouter();
  const [handingOff, setHandingOff] = React.useState(false);
  const [handoffError, setHandoffError] = React.useState<string | null>(null);

  const continueToQuote = async () => {
    if (!job?.stlUrl) return;
    setHandingOff(true);
    setHandoffError(null);
    try {
      const res = await fetch(job.stlUrl);
      if (!res.ok) throw new Error(`fetch STL ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "model/stl" });
      await savePendingUpload(file);
      // Carry the run size across the handoff so /configure doesn't silently
      // reset a 25-unit merch order back to 1.
      await savePendingHints({ quantity: job.quantity ?? 1 });
      router.push("/configure");
    } catch (e) {
      setHandoffError(
        e instanceof Error ? e.message : "Couldn't hand off — try again.",
      );
      setHandingOff(false);
    }
  };

  if (error) {
    return (
      <Card>
        <CardSection>
          <MonoLabel size="sm" muted={false} className="text-[#ef4444]">
            Connection hiccup — retrying…
          </MonoLabel>
        </CardSection>
      </Card>
    );
  }
  if (!job) {
    return (
      <Card>
        <CardSection>
          <div className="flex items-center gap-3">
            <StatusDot tone="printing" pulse />
            <MonoLabel size="sm">Starting…</MonoLabel>
          </div>
        </CardSection>
      </Card>
    );
  }

  if (job.state === "failed" || job.state === "blocked") {
    return (
      <Card>
        <CardSection>
          <div className="flex items-start gap-3">
            <StatusDot tone="warn" className="mt-1" />
            <div>
              <p className="text-sm font-light text-black">
                {job.state === "blocked"
                  ? job.failReason ?? "We can't generate that — try an original design."
                  : job.failReason ?? "Something went wrong preparing this model."}
              </p>
              <MonoLabel size="xs" className="mt-1 block">
                {job.state === "blocked" ? "Not generated · no credit used" : "Try different settings"}
              </MonoLabel>
            </div>
          </div>
        </CardSection>
      </Card>
    );
  }

  if (job.state !== "ready") {
    const pct =
      job.state === "generating"
        ? Math.max(4, job.progress)
        : job.state === "downloading" || job.state === "processing"
          ? 100
          : 8;
    return (
      <Card>
        <CardSection>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StatusDot tone="printing" pulse />
              <MonoLabel size="sm" muted={false}>
                {STATE_COPY[job.state] ?? "Working…"}
              </MonoLabel>
            </div>
            {job.state === "generating" ? (
              <MonoLabel size="xs">~2 min · {job.progress}%</MonoLabel>
            ) : null}
          </div>
          <ProgressBar value={pct} className="mt-3" />
          <MonoLabel size="xs" className="mt-3 block">
            Rebuilt server-side · repaired · slice-checked. If it quotes, it prints.
          </MonoLabel>
        </CardSection>
      </Card>
    );
  }

  const m = job.metrics;
  return (
    <Card>
      <CardSection>
        {job.badge ? <PrintabilityBadge badge={job.badge} /> : null}
        {m ? (
          <MonoLabel size="sm" className="mt-3 block">
            {m.bboxMm.map((v) => Math.round(v)).join(" × ")} mm ·{" "}
            {formatTime(m.printTimeS)} print · {m.filamentG.toFixed(0)} g PLA
            {!m.sliced ? " · estimated" : ""}
          </MonoLabel>
        ) : null}
      </CardSection>
      <CardSection>
        <div className="flex items-center justify-between gap-3">
          <div>
            {job.quote ? (
              <>
                <div className="text-2xl font-light tracking-tight text-black">
                  £{job.quote.total.toFixed(2)}
                </div>
                <MonoLabel size="xs">
                  {job.quantity > 1
                    ? `${job.quantity} units · £${(job.quote.total / job.quantity).toFixed(2)} each`
                    : "Indicative · PLA · standard · pickup"}
                </MonoLabel>
                {job.quote.quantityTierPct > 0 ? (
                  <MonoLabel
                    size="xs"
                    muted={false}
                    className="mt-1 block text-[#047857]"
                  >
                    Volume break · {job.quote.quantityTierPct}% off
                  </MonoLabel>
                ) : null}
              </>
            ) : null}
          </div>
          <Button
            size="lg"
            withArrow
            onClick={continueToQuote}
            disabled={handingOff}
          >
            {handingOff
              ? "Preparing…"
              : job.badge === "too_fragile"
                ? "Print — scale up first"
                : "Print with a maker"}
          </Button>
        </div>
        {handoffError ? (
          <MonoLabel size="xs" muted={false} className="mt-2 block text-[#ef4444]">
            {handoffError}
          </MonoLabel>
        ) : null}
        {job.stlUrl ? (
          <a
            href={job.stlUrl}
            download
            className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.18em] text-black/40 underline underline-offset-4 transition-colors hover:text-black"
          >
            Download STL
          </a>
        ) : null}
      </CardSection>
    </Card>
  );
}
