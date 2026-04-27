"use client";
import * as React from "react";
import { fetchHealth, type SlicerStatus } from "@/lib/api";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusDot } from "@/components/ui/StatusDot";

export function SlicerChip() {
  const [status, setStatus] = React.useState<
    | { kind: "loading" }
    | { kind: "down" }
    | { kind: "up"; slicer: SlicerStatus; version: string }
  >({ kind: "loading" });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const h = await fetchHealth();
      if (!alive) return;
      if (!h) setStatus({ kind: "down" });
      else setStatus({ kind: "up", slicer: h.slicer, version: h.version });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (status.kind === "loading") {
    return (
      <div className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white">
        <StatusDot tone="neutral" />
        <MonoLabel size="sm" className="!text-black/55">
          API · probing
        </MonoLabel>
      </div>
    );
  }

  if (status.kind === "down") {
    return (
      <div className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white">
        <StatusDot tone="offline" />
        <MonoLabel size="sm" className="!text-black/55">
          API offline · client-side estimate
        </MonoLabel>
      </div>
    );
  }

  const { slicer } = status;
  return (
    <div
      className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white"
      title={
        slicer.available
          ? `PrusaSlicer ${slicer.version ?? ""} at ${slicer.path}`
          : "PrusaSlicer not found on PATH — falling back to volume estimate"
      }
    >
      <StatusDot tone={slicer.available ? "ready" : "warn"} pulse />
      <MonoLabel size="sm" className="!text-black">
        {slicer.available
          ? `Slicer · ${slicer.engine}${slicer.version ? " " + slicer.version : ""}`
          : "Slicer · volume estimate"}
      </MonoLabel>
    </div>
  );
}
