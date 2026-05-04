"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ViewerShell } from "@/components/configure/ViewerShell";
import { ConfigPanel } from "@/components/configure/ConfigPanel";
import { defaultPartColors, useOrder } from "@/lib/order-store";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { analyzeSTL } from "@/lib/stl";
import {
  clearPendingUpload,
  loadPendingUpload,
} from "@/lib/order-storage";
import { MATERIALS } from "@/lib/catalog";
import { postAnalyze } from "@/lib/api";

export default function ConfigurePage() {
  const router = useRouter();
  const { draft, set } = useOrder();
  const [hydrating, setHydrating] = React.useState(true);

  // Rehydrate from IndexedDB when in-memory state is empty (e.g. after the
  // sign-in OAuth round-trip wiped React state). If nothing's stashed,
  // bounce back to the homepage upload.
  React.useEffect(() => {
    let cancelled = false;
    if (draft.analysis) {
      setHydrating(false);
      return;
    }
    (async () => {
      const file = await loadPendingUpload().catch(() => null);
      if (cancelled) return;
      if (!file) {
        router.replace("/");
        return;
      }
      try {
        const [analysis, serverAnalysis] = await Promise.all([
          analyzeSTL(file),
          postAnalyze(file).catch(() => null),
        ]);
        if (cancelled) return;
        const partColors = defaultPartColors(
          analysis,
          MATERIALS[0].colors[0].hex,
        );
        set({ file, analysis, serverAnalysis, partColors });
        await clearPendingUpload().catch(() => undefined);
      } catch {
        await clearPendingUpload().catch(() => undefined);
        if (!cancelled) router.replace("/");
        return;
      }
      if (!cancelled) setHydrating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.analysis, router, set]);

  if (!draft.analysis) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <MonoLabel size="md">
          {hydrating ? "Loading your upload…" : "No file loaded"}
        </MonoLabel>
        {!hydrating ? (
          <Link
            href="/"
            className="text-sm font-medium underline underline-offset-4"
          >
            ← Back to upload
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    // Clamp the whole configure page to viewport-minus-chrome on md+, with
    // overflow-hidden so the page itself can never gain a scrollbar. Inside,
    // the breadcrumb is a fixed row, the workbench fills the rest, and only
    // the right config column scrolls.
    //
    // We use both `vh` (universal) and `dvh` (modern + correct on mobile)
    // by stacking the utilities — `dvh` wins if supported, `vh` otherwise.
    <div className="flex-1 flex flex-col bg-grid-none md:h-[calc(100vh-88px)] md:max-h-[calc(100vh-88px)] md:[height:calc(100dvh-88px)] md:[max-height:calc(100dvh-88px)] md:overflow-hidden">
      {/* Breadcrumb */}
      <div className="border-b border-black/[0.06] bg-white shrink-0">
        <div className="max-w-[1800px] mx-auto px-5 md:px-8 h-10 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/55 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Upload
          </Link>
          <div className="flex items-center gap-4">
            <StepCrumb idx="01" label="Upload" state="done" />
            <Divider />
            <StepCrumb idx="02" label="Configure" state="active" />
            <Divider />
            <StepCrumb idx="03" label="Checkout" state="next" />
            <Divider />
            <StepCrumb idx="04" label="Track" state="next" />
          </div>
          <div className="w-14" />
        </div>
      </div>

      {draft.analysis.format === "step" ? (
        <div className="border-b border-amber-500/30 bg-amber-500/[0.06] shrink-0">
          <div className="max-w-[1800px] mx-auto px-5 md:px-8 py-2.5 text-[12px] leading-snug text-amber-900 font-light">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold mr-2">STEP file</span>
            The preview is a placeholder cube — your file is fine. STEP is a parametric CAD format the browser can&rsquo;t tessellate, so we forward it untouched to your maker, whose slicer (Bambu Studio, PrusaSlicer, Cura) handles it natively. You&rsquo;ll set the price manually on the next step since we can&rsquo;t auto-quote without volume.
          </div>
        </div>
      ) : null}

      {/* Workbench: fills the remaining space inside the clamped page. The
          parent's bounded height + min-h-0 here lets each column be exactly
          the viewport height the parent has measured for the workbench. */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row md:overflow-hidden">
        <ViewerShell />
        <ConfigPanel />
      </div>
    </div>
  );
}

function StepCrumb({
  idx,
  label,
  state,
}: {
  idx: string;
  label: string;
  state: "done" | "active" | "next";
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`font-mono text-[9px] tracking-[0.2em] font-bold ${state === "next" ? "text-black/25" : "text-[#0a0a0a]"}`}
      >
        {idx}
      </span>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          state === "active"
            ? "text-[#0a0a0a] font-bold"
            : state === "done"
              ? "text-black/55"
              : "text-black/25"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="w-4 h-px bg-black/15" />;
}
