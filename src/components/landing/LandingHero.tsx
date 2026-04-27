"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/ui/Dropzone";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusDot } from "@/components/ui/StatusDot";
import { analyzeSTL } from "@/lib/stl";
import { defaultPartColors, useOrder } from "@/lib/order-store";
import { MATERIALS } from "@/lib/catalog";
import { postAnalyze } from "@/lib/api";
import { SlicerChip } from "@/components/shell/SlicerChip";

export function LandingHero() {
  const router = useRouter();
  const { set } = useOrder();
  const [analyzing, setAnalyzing] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const handleFile = async (f: File) => {
    setErrMsg(null);
    setAnalyzing(true);
    try {
      // Run client-side parse (needed for geometry) and server-side Trimesh
      // analysis (authoritative volume + watertightness) in parallel.
      const [analysis, serverAnalysis] = await Promise.all([
        analyzeSTL(f),
        postAnalyze(f).catch((e) => {
          console.warn("server analyze failed, degrading:", e);
          return null;
        }),
      ]);
      const partColors = defaultPartColors(analysis, MATERIALS[0].colors[0].hex);
      set({ file: f, analysis, serverAnalysis, partColors });
      router.push("/configure");
    } catch (e) {
      console.error(e);
      setErrMsg(
        "Could not parse that file. Try a different STL, or make sure it is a valid binary / ASCII STL.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <section id="top" className="relative scroll-mt-16">
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-12 md:pt-20 pb-8 md:pb-16">
        {/* Hero eyebrow */}
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          <div className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white">
            <StatusDot tone="ready" pulse />
            <MonoLabel size="sm" className="!text-black">
              Network · Live
            </MonoLabel>
          </div>
          <MonoLabel size="sm">
            41 makers online · typical quote in seconds
          </MonoLabel>
          <SlicerChip />
        </div>

        {/* Headline */}
        <div className="max-w-5xl">
          <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[120px] leading-[0.95] font-black tracking-tight">
            <span className="shimmer-text">Upload.</span>{" "}
            <span className="shimmer-text" style={{ animationDelay: "0.8s" }}>
              Pay.
            </span>{" "}
            <span className="shimmer-text" style={{ animationDelay: "1.6s" }}>
              Print.
            </span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg md:text-xl font-light text-black/60 leading-relaxed">
            The 2-tap 3D printing marketplace. Drop an STL, we&rsquo;ll quote
            it in real time against every hobbyist printer on the network.
            Pick up when it&rsquo;s ready, or opt for a courier where
            available.
          </p>
        </div>

        {/* Dropzone */}
        <div className="mt-10 md:mt-14 max-w-3xl">
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
            <MonoLabel size="sm">
              01 — Upload
            </MonoLabel>
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
      </div>

      {/* Side metadata */}
      <div className="hidden lg:flex flex-col gap-6 absolute right-8 top-24 text-right">
        <Metric label="avg quote" value="0.8 s" />
        <Metric label="typical pickup" value="~ 2 h 40" />
        <Metric label="makers online" value="41" />
        <Metric label="ready now" value="17" />
      </div>
      <div className="hidden lg:block absolute right-8 top-[380px] max-w-[160px] text-right">
        <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-black/30 leading-relaxed">
          Typicals shown from historical orders. Your wait varies with maker
          queue, model complexity and distance.
        </span>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-black/35">
        {label}
      </div>
      <div className="font-mono text-lg font-bold tabular-nums mt-0.5">
        {value}
      </div>
    </div>
  );
}
