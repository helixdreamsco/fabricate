"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { Plus, Minus, Maximize2 } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatBytes, cn } from "@/lib/utils";
import { useOrder } from "@/lib/order-store";
import { ViewerErrorBoundary } from "./ViewerErrorBoundary";
import type { ViewerHandle } from "./Viewer";

const Viewer = dynamic(
  () => import("./Viewer").then((m) => m.Viewer),
  { ssr: false },
);

export function ViewerShell() {
  const { draft } = useOrder();
  const handle = React.useRef<ViewerHandle | null>(null);

  if (!draft.analysis) return null;

  const { dimsMm, triangleCount, volumeCm3, fileName, fileSize } =
    draft.analysis;

  return (
    <div className="relative flex-1 min-h-[60vh] md:min-h-0 md:h-full md:max-h-full bg-white bg-grid-none overflow-hidden">
      <ViewerErrorBoundary
        resetKey={draft.analysis.parts.map((p) => p.geometry.uuid).join("|")}
      >
        <Viewer
          parts={draft.analysis.parts.map((p, i) => ({
            id: p.geometry.uuid,
            geometry: p.geometry,
            color: draft.partColors[i] ?? draft.partColors[0] ?? "#0a0a0a",
          }))}
          controlRef={handle}
        />
      </ViewerErrorBoundary>

      {/* Top-left: file badge */}
      <div className="pointer-events-none absolute top-5 left-5 flex flex-col gap-2">
        <div className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-black/10 bg-white/90 backdrop-blur pl-1 pr-4 py-1">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0a0a0a] text-white font-mono text-[9px] tracking-wider">
            {fileName.split(".").pop()?.toUpperCase() ?? "STL"}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium truncate max-w-[240px]">
              {fileName}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
              {formatBytes(fileSize)}
            </span>
          </div>
        </div>
      </div>

      {/* Top-right: live session status */}
      <div className="pointer-events-none absolute top-5 right-5 flex items-center gap-2 rounded-full border border-black/10 bg-white/90 backdrop-blur pl-2 pr-3 py-1.5">
        <StatusDot tone="ready" pulse />
        <MonoLabel size="sm" className="!text-black">
          Live preview
        </MonoLabel>
      </div>

      {/* Bottom-left: mesh metrics */}
      <div className="pointer-events-none absolute bottom-5 left-5 flex flex-wrap gap-2">
        <Metric
          label="Dimensions"
          value={`${dimsMm.x.toFixed(1)} × ${dimsMm.y.toFixed(
            1,
          )} × ${dimsMm.z.toFixed(1)} mm`}
        />
        <Metric label="Volume" value={`${volumeCm3.toFixed(2)} cm³`} />
        <Metric
          label="Triangles"
          value={triangleCount.toLocaleString("en-GB")}
        />
      </div>

      {/* Bottom-right: zoom buttons + interaction hint */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
        <div className="pointer-events-auto inline-flex items-center gap-1 p-1 rounded-full border border-black/10 bg-white/90 backdrop-blur">
          <ZoomBtn
            label="Zoom out"
            onClick={() => handle.current?.zoomOut()}
          >
            <Minus className="w-3.5 h-3.5" strokeWidth={2.4} />
          </ZoomBtn>
          <ZoomBtn label="Fit" onClick={() => handle.current?.fit()}>
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={2.2} />
          </ZoomBtn>
          <ZoomBtn label="Zoom in" onClick={() => handle.current?.zoomIn()}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
          </ZoomBtn>
        </div>
        <MonoLabel size="sm">Drag to orbit · use buttons to zoom</MonoLabel>
      </div>
    </div>
  );
}

function ZoomBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-[#0a0a0a]",
        "hover:bg-black/[0.05] active:scale-[0.92] transition-all",
      )}
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/85 backdrop-blur border border-black/10 rounded-xl px-3 py-2 flex flex-col leading-tight">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/40">
        {label}
      </span>
      <span className="font-mono text-[13px] font-bold tabular-nums text-[#0a0a0a] mt-0.5">
        {value}
      </span>
    </div>
  );
}
