"use client";
import * as React from "react";

export interface DesignJobView {
  id: string;
  kind: "preset" | "ai";
  provider: string | null;
  templateId: string | null;
  templateVersion: number | null;
  params: Record<string, string | number> | null;
  /** Units ordered. 1 for single-item templates and all AI jobs. */
  quantity: number;
  state:
    | "queued" | "moderating" | "blocked" | "generating" | "downloading"
    | "processing" | "ready" | "failed";
  progress: number;
  stage: "preview" | "refined" | null;
  failReason: string | null;
  badge: "ready" | "needs_supports" | "too_fragile" | null;
  stlUrl: string | null;
  glbUrl: string | null;
  metrics: {
    printTimeS: number;
    filamentG: number;
    bboxMm: [number, number, number];
    triangles: number;
    thinAreas: number;
    sliced: boolean;
    supportsNeeded: boolean;
  } | null;
  quote: {
    total: number;
    estMinutes: number;
    weightG: number;
    /** Volume break applied, for the "25+ −20%" badge. 0 when none. */
    quantityTierPct: number;
  } | null;
}

const TERMINAL = new Set(["ready", "failed", "blocked"]);

/** Poll a design job every 3 s until it reaches a terminal state. */
export function useDesignJob(jobId: string | null): {
  job: DesignJobView | null;
  error: string | null;
} {
  const [job, setJob] = React.useState<DesignJobView | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let first = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/design/jobs/${jobId}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as DesignJobView;
        if (cancelled) return;
        if (first) {
          // reset stale state from a previous job on the first tick
          first = false;
          setError(null);
        }
        setJob(data);
        if (TERMINAL.has(data.state) && timer) clearInterval(timer);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "poll failed");
      }
    };

    void poll();
    timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [jobId]);

  return { job, error };
}
