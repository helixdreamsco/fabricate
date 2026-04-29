"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

export function AdminResolveDisputeForm({
  disputeId,
  paymentAmountPence,
  hasPayment,
}: {
  disputeId: string;
  paymentAmountPence: number;
  hasPayment: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = React.useState<"creator" | "maker">("creator");
  const [refundPounds, setRefundPounds] = React.useState(
    (paymentAmountPence / 100).toFixed(2),
  );
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const refundAmountPence =
        outcome === "creator" && hasPayment
          ? Math.round(parseFloat(refundPounds) * 100)
          : undefined;
      const res = await fetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome,
          note: note || null,
          refundAmountPence,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-md border border-black/[0.08] p-3 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 text-sm font-light cursor-pointer">
          <input
            type="radio"
            name={`outcome-${disputeId}`}
            value="creator"
            checked={outcome === "creator"}
            onChange={() => setOutcome("creator")}
          />
          Creator wins (cancel + refund)
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-light cursor-pointer">
          <input
            type="radio"
            name={`outcome-${disputeId}`}
            value="maker"
            checked={outcome === "maker"}
            onChange={() => setOutcome("maker")}
          />
          Maker wins (mark complete)
        </label>
      </div>

      {outcome === "creator" && hasPayment ? (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
            Refund £
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            max={(paymentAmountPence / 100).toFixed(2)}
            value={refundPounds}
            onChange={(e) => setRefundPounds(e.target.value)}
            className="w-24 bg-transparent border-b border-black/15 text-right text-sm font-mono outline-none focus:border-black/50 transition-colors"
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
            of £{(paymentAmountPence / 100).toFixed(2)}
          </span>
        </div>
      ) : null}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (visible to both parties)"
        maxLength={500}
        className="w-full bg-transparent border border-black/15 rounded-md p-2 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[50px]"
      />

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-black/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/75 hover:text-black hover:border-black/45 disabled:opacity-50 transition-colors"
      >
        {pending ? "Resolving…" : "Resolve dispute"}
      </button>
    </form>
  );
}
