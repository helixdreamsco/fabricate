"use client";
import * as React from "react";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import { Viewer, type ViewerPart } from "@/components/configure/Viewer";
import { MonoLabel } from "@/components/ui/MonoLabel";
import type { PreviewResult } from "@/lib/design/preview/buildPreview";

/**
 * Design preview pane — reuses the configure flow's Viewer so designs render
 * exactly like uploaded parts (same grid, shadows, controls, framing).
 */

const INK = "#0a0a0a";
const ACCENT = "#9ca3af";

function useGlbParts(url: string | null): ViewerPart[] | null {
  const [parts, setParts] = React.useState<ViewerPart[] | null>(null);
  React.useEffect(() => {
    setParts(null);
    if (!url) return;
    let cancelled = false;
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (cancelled) return;
        const found: ViewerPart[] = [];
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.geometry) {
            const geo = (obj.geometry as THREE.BufferGeometry).clone();
            geo.applyMatrix4(obj.matrixWorld);
            found.push({ id: geo.uuid, geometry: geo, color: INK });
          }
        });
        setParts(found);
      },
      undefined,
      () => setParts(null),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);
  return parts;
}

export function DesignViewer({
  preview,
  glbUrl,
  overlayNote,
}: {
  /** Live cosmetic preview geometry (Z-up; rotated for display). */
  preview?: PreviewResult | null;
  /** When set, show the server's print-checked GLB instead. */
  glbUrl?: string | null;
  overlayNote?: string | null;
}) {
  const glbParts = useGlbParts(glbUrl ?? null);

  const parts = React.useMemo<ViewerPart[]>(() => {
    if (glbParts && glbParts.length) return glbParts;
    if (!preview) return [];
    const rotate = (g: THREE.BufferGeometry) => {
      const clone = g.clone();
      clone.rotateX(-Math.PI / 2); // worker geometry is Z-up; viewer is Y-up
      return clone;
    };
    const out: ViewerPart[] = [
      { id: "base", geometry: rotate(preview.base), color: INK },
    ];
    if (preview.overlay) {
      out.push({
        id: "overlay",
        geometry: rotate(preview.overlay),
        color: preview.overlayMode === "deboss" ? ACCENT : INK,
      });
    }
    return out;
  }, [preview, glbParts]);

  return (
    <div className="relative h-full w-full bg-white">
      {parts.length ? (
        <Viewer parts={parts} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <MonoLabel size="sm">Loading preview…</MonoLabel>
        </div>
      )}
      {overlayNote ? (
        <div className="absolute left-4 top-4 rounded-full border border-black/10 bg-white/90 px-3 py-1.5 backdrop-blur">
          <MonoLabel size="sm" className="text-[#10b981]" muted={false}>
            {overlayNote}
          </MonoLabel>
        </div>
      ) : null}
    </div>
  );
}
