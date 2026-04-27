"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { ViewerErrorBoundary } from "./ViewerErrorBoundary";
import type { ViewerPart } from "./Viewer";

const InnerViewer = dynamic(
  () => import("./Viewer").then((m) => m.Viewer),
  { ssr: false },
);

export function MiniViewer({
  parts,
  className,
}: {
  parts: ViewerPart[];
  className?: string;
}) {
  const resetKey = parts.map((p) => p.id ?? p.geometry.uuid).join("|");
  return (
    <div className={className}>
      <ViewerErrorBoundary resetKey={resetKey}>
        <InnerViewer parts={parts} />
      </ViewerErrorBoundary>
    </div>
  );
}
