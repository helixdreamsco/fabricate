"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { ParamControls } from "./ParamControls";
import { QuantityPicker } from "./QuantityPicker";
import { DesignViewer } from "./DesignViewer";
import { DesignJobStatus } from "./DesignJobStatus";
import { useDesignJob } from "@/hooks/useDesignJob";
import type { ParamValues, TemplateSpec } from "@/lib/design/schema";
import { defaultParams } from "@/lib/design/schema";
import type { PreviewResult } from "@/lib/design/preview/buildPreview";

/**
 * Template customiser: live cosmetic preview in the browser, authoritative
 * server rebuild on "Get instant quote". The client only ever sends the
 * parameter JSON — never a mesh.
 */
export function Customiser({
  spec,
  initialParams,
}: {
  spec: TemplateSpec;
  initialParams?: ParamValues;
}) {
  const [values, setValues] = React.useState<ParamValues>(
    () => initialParams ?? defaultParams(spec),
  );
  // Sibling to the params, never inside them: N units are one identical STL,
  // so quantity must not change the geometry hash.
  const [quantity, setQuantity] = React.useState<number>(
    () => spec.quantity?.default ?? 1,
  );
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [previewBroken, setPreviewBroken] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const { job, error: pollError } = useDesignJob(jobId);
  const renderSeq = React.useRef(0);

  // Debounced live re-render while the user edits (<200 ms perceived).
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      const seq = ++renderSeq.current;
      try {
        const { buildPreview } = await import("@/lib/design/preview/buildPreview");
        const result = await buildPreview(spec, values);
        if (seq === renderSeq.current) {
          setPreview(result);
          setPreviewBroken(false);
        }
      } catch (e) {
        console.warn("design preview failed", e);
        if (seq === renderSeq.current) setPreviewBroken(true);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [spec, values]);

  const onChange = React.useCallback((key: string, value: string | number) => {
    setValues((v) => ({ ...v, [key]: value }));
    setJobId(null); // params changed — previous quote is stale
  }, []);

  const getQuote = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/design/preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: spec.id,
          templateVersion: spec.version,
          params: values,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `status ${res.status}`);
      setJobId(data.jobId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const showFinal = job?.state === "ready" && job.glbUrl;

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col md:flex-row">
      {/* Viewer — primary viewport on mobile */}
      <div className="relative h-[45vh] min-h-[320px] flex-1 border-b border-black/[0.06] md:h-auto md:border-b-0 md:border-r">
        <DesignViewer
          preview={showFinal ? null : preview}
          glbUrl={showFinal ? job.glbUrl : null}
          overlayNote={showFinal ? "Print-checked model" : null}
        />
        {previewBroken ? (
          <div className="absolute inset-x-4 top-4 rounded-lg border border-black/10 bg-white/95 p-3 text-center backdrop-blur">
            <MonoLabel size="xs">
              Live preview unavailable — the quote preview below shows the exact
              final model.
            </MonoLabel>
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div className="w-full shrink-0 bg-white p-5 md:w-[400px] md:overflow-y-auto md:p-6">
        <Link
          href="/design"
          className="mb-4 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 transition-colors hover:text-black"
        >
          <ArrowLeft className="h-3 w-3" /> All templates
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-black">{spec.name}</h1>
        <p className="mb-5 mt-1 text-sm font-light text-black/55">
          {spec.description}
        </p>

        <ParamControls spec={spec} values={values} onChange={onChange} />

        <QuantityPicker
          spec={spec}
          value={quantity}
          onChange={(n) => {
            setQuantity(n);
            setJobId(null); // run size changed — previous quote is stale
          }}
        />

        <div className="mt-6 flex flex-col gap-3">
          {!jobId ? (
            <Button size="lg" withArrow onClick={getQuote} disabled={submitting} className="w-full">
              {submitting ? "Preparing…" : "Get instant quote"}
            </Button>
          ) : (
            <DesignJobStatus
              job={job}
              error={pollError}
              fileName={`${spec.id}.stl`}
            />
          )}
          {submitError ? (
            <MonoLabel size="xs" muted={false} className="text-[#ef4444]">
              Couldn&apos;t start: {submitError}
            </MonoLabel>
          ) : null}
        </div>
        <MonoLabel size="xs" className="mt-4 block">
          Rebuilt and slice-checked on our servers before you pay — if it
          quotes, it prints.
        </MonoLabel>
      </div>
    </div>
  );
}
