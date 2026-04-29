"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";

/**
 * Creator-side prompt: shown when no test strip is active for this job.
 * Offers the creator a button to request one for free — typically after a
 * print issue, to verify whether the printer or the design is at fault.
 */
export function TestStripRequestPrompt({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onRequest = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/test-strip/request`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
        Test strip
      </div>
      <p className="text-sm font-light text-black/70 leading-relaxed">
        Worried about quality, or is something off with your print? Ask your
        maker for a test strip — they print a small stencil with your
        order&rsquo;s unique code and photograph it next to the finished
        part. It proves whether the printer is working correctly.
      </p>
      <button
        type="button"
        onClick={onRequest}
        disabled={pending}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-black/[0.15] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/75 hover:border-black/45 hover:text-black transition-colors disabled:opacity-50"
      >
        {pending ? "Requesting…" : "Request test strip · free"}
      </button>
      {error ? (
        <div className="mt-2 text-xs text-red-600 font-light">{error}</div>
      ) : null}
    </Card>
  );
}
