"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardSection } from "@/components/ui/Card";
import { Dropzone, FilePill } from "@/components/ui/Dropzone";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { StatusDot } from "@/components/ui/StatusDot";
import { analyzeSTL } from "@/lib/stl";
import { defaultPartColors, useOrder } from "@/lib/order-store";
import { savePendingUpload } from "@/lib/order-storage";
import { MATERIALS } from "@/lib/catalog";
import { postAnalyze } from "@/lib/api";
import { describeUploadError, preflightUploadError } from "@/lib/upload-error";
import { AiComposer } from "./AiComposer";

const FLOW = [
  {
    n: "1",
    title: "Say it or send it",
    body: "Describe the thing in words, or drop in a 3D file you already have.",
  },
  {
    n: "2",
    title: "A nearby maker prints it",
    body: "Your job goes to makers in your city. One picks it up and prints it.",
  },
  {
    n: "3",
    title: "Collect it today",
    body: "Pick it up around the corner, or have it couriered to your door.",
  },
];

export function LandingHero({
  makerCount,
  freeGenerations,
}: {
  /** Makers on the network. null when we'd rather not quote a number. */
  makerCount: number | null;
  freeGenerations: number;
}) {
  const router = useRouter();
  const { set } = useOrder();
  const [file, setFile] = React.useState<File | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const uploadRef = React.useRef<HTMLDivElement | null>(null);

  const handleFile = async (f: File) => {
    setErrMsg(null);
    const pre = preflightUploadError(f);
    if (pre) {
      setErrMsg(pre);
      return;
    }
    setFile(f);
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
      // Stash the file in IndexedDB so /configure can rehydrate after the
      // sign-in round-trip wipes in-memory React state.
      await savePendingUpload(f).catch((err) =>
        console.warn("savePendingUpload failed:", err),
      );
      router.push("/configure");
    } catch (e) {
      console.error(e);
      setErrMsg(describeUploadError(f, e));
      setFile(null);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <section id="top" className="relative scroll-mt-16">
      <div className="mx-auto max-w-[1280px] px-5 pb-14 pt-12 md:px-8 md:pb-[72px] md:pt-[72px]">
        {/* Eyebrow */}
        <div className="mb-7 flex flex-wrap items-center gap-3">
          <span className="inline-flex h-7 items-center gap-2 rounded-full border border-black/10 bg-white pl-2 pr-3">
            <StatusDot tone="ready" pulse />
            <MonoLabel size="sm" muted={false}>
              {makerCount
                ? `${makerCount} maker${makerCount === 1 ? "" : "s"} on the network in London`
                : "London · live"}
            </MonoLabel>
          </span>
          <MonoLabel size="sm">
            Cosplay props · keycaps · jewellery · minis · prototypes
          </MonoLabel>
        </div>

        {/* Pitch on the left, the two ways in on the right. */}
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h1 className="m-0 text-5xl font-black leading-[0.98] tracking-tight sm:text-6xl lg:text-[76px]">
              Get anything
              <br />
              3D printed by a
              <br />
              maker near you.
            </h1>
            <p className="mt-6 max-w-[520px] text-lg font-light leading-relaxed text-black/60 text-pretty md:text-[19px]">
              Describe what you want or upload a file. We price it instantly, a
              local maker prints it, and you collect it the same day. No
              printer, no software, no minimum order.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                withArrow
                onClick={() => {
                  composerRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                  composerRef.current?.focus();
                }}
              >
                Describe your idea
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() =>
                  uploadRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  })
                }
              >
                Upload a file
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5">
              <MonoLabel size="sm">Free instant quote</MonoLabel>
              <MonoLabel size="sm">Pay only when a maker accepts</MonoLabel>
              <MonoLabel size="sm">Pickup or courier</MonoLabel>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <AiComposer
              inputRef={composerRef}
              freeGenerations={freeGenerations}
            />
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-black/[0.08]" />
              <MonoLabel size="xs">Or already have a file</MonoLabel>
              <span className="h-px flex-1 bg-black/[0.08]" />
            </div>
            <div ref={uploadRef} className="scroll-mt-24">
              {file ? (
                <Card>
                  <CardSection>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <FilePill
                        file={file}
                        onRemove={
                          analyzing ? undefined : () => setFile(null)
                        }
                      />
                      <span className="inline-flex items-center gap-2">
                        <StatusDot
                          tone={analyzing ? "printing" : "ready"}
                          pulse={analyzing}
                        />
                        <MonoLabel size="sm" muted={false}>
                          {analyzing
                            ? "Analysing mesh…"
                            : "Ready · opening configurator"}
                        </MonoLabel>
                      </span>
                    </div>
                  </CardSection>
                </Card>
              ) : (
                <Dropzone onFile={handleFile} compact />
              )}
            </div>
            {errMsg ? (
              <div className="font-mono text-[12px] text-[#ef4444]">
                {errMsg}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <MonoLabel size="sm">
                .stl · .3mf · .obj · .step — max 80 MB
              </MonoLabel>
              <MonoLabel size="sm">Analysed in your browser</MonoLabel>
            </div>
          </div>
        </div>

        {/* Idea → in hand, in three lines. */}
        <div className="mt-14 flex flex-col gap-6 border-t border-black/[0.08] pt-7 md:flex-row md:gap-6">
          {FLOW.map((s, i) => (
            <div
              key={s.n}
              className={
                i === FLOW.length - 1
                  ? "flex flex-1 items-start gap-3.5"
                  : "flex flex-1 items-start gap-3.5 md:border-r md:border-black/[0.08] md:pr-6"
              }
            >
              <span className="mt-px flex h-6 w-6 flex-none items-center justify-center rounded-full border border-black/15 font-mono text-[10px] font-bold">
                {s.n}
              </span>
              <div>
                <p className="m-0 text-[15px] font-medium tracking-[-0.01em] text-black">
                  {s.title}
                </p>
                <p className="mt-1 text-[13px] font-light leading-[1.5] text-black/55 text-pretty">
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
