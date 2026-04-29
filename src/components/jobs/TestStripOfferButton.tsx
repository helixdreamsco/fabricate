"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Maker-side button: lets the assigned maker preemptively offer a test
 * strip to the creator (makes the test strip card visible on the creator's
 * job page). Shown beneath the maker's TestStripCard when nothing has
 * activated the strip yet.
 */
export function TestStripOfferButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onOffer = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/test-strip/offer`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `offer failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onOffer}
        disabled={pending}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-black/[0.15] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/75 hover:border-black/45 hover:text-black transition-colors disabled:opacity-50"
      >
        {pending ? "Offering…" : "Offer test strip preemptively"}
      </button>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mt-1.5 leading-relaxed">
        Tells the creator you&rsquo;re including a verification stencil with
        their order. Surfaces the code on their side too.
      </p>
      {error ? (
        <div className="mt-2 text-xs text-red-600 font-light">{error}</div>
      ) : null}
    </div>
  );
}
