"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/ui/Dropzone";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { analyzeSTL } from "@/lib/stl";
import { defaultPartColors, useOrder } from "@/lib/order-store";
import { savePendingUpload } from "@/lib/order-storage";
import { MATERIALS } from "@/lib/catalog";
import { postAnalyze } from "@/lib/api";
import { describeUploadError, preflightUploadError } from "@/lib/upload-error";
import { track } from "@/lib/analytics";

/**
 * Compact upload dropzone for SEO landing pages. Same file-handling logic as
 * the homepage hero — wrapper exists so each landing page can drop it inline
 * without redrawing the whole hero block.
 */
export function LandingDropzone({ source }: { source: string }) {
  const router = useRouter();
  const { set } = useOrder();
  const [analyzing, setAnalyzing] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const handleFile = async (f: File) => {
    setErrMsg(null);
    const pre = preflightUploadError(f);
    if (pre) {
      setErrMsg(pre);
      return;
    }
    setAnalyzing(true);
    try {
      const [analysis, serverAnalysis] = await Promise.all([
        analyzeSTL(f),
        postAnalyze(f).catch((e) => {
          console.warn("server analyze failed, degrading:", e);
          return null;
        }),
      ]);
      const partColors = defaultPartColors(analysis, MATERIALS[0].colors[0].hex);
      set({ file: f, analysis, serverAnalysis, partColors });
      track("upload_started", {
        source,
        format: f.name.split(".").pop()?.toLowerCase() ?? "unknown",
        size_kb: Math.round(f.size / 1024),
      });
      await savePendingUpload(f).catch((err) =>
        console.warn("savePendingUpload failed:", err),
      );
      router.push("/configure");
    } catch (e) {
      console.error(e);
      setErrMsg(describeUploadError(f, e));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Dropzone
        onFile={handleFile}
        helperText={
          analyzing
            ? "Analysing mesh… computing volume and bounding box"
            : undefined
        }
      />
      {errMsg ? (
        <div className="mt-3 text-[12px] text-[#ef4444] font-mono">
          {errMsg}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <MonoLabel size="sm">01 — Upload</MonoLabel>
        <MonoLabel size="sm" className="text-black/20">
          02 — Configure
        </MonoLabel>
        <MonoLabel size="sm" className="text-black/20">
          03 — Pay
        </MonoLabel>
        <MonoLabel size="sm" className="text-black/20">
          04 — Collect
        </MonoLabel>
      </div>
    </div>
  );
}
