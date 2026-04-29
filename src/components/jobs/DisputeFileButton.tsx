"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

export function DisputeFileButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/disputes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `failed (${res.status})`);
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-800 hover:bg-amber-500/20 transition-colors"
      >
        Report an issue
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1.5">
          What went wrong?
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe the issue. Be specific — this is what an admin reads when resolving the dispute."
          maxLength={1000}
          required
          autoFocus
          className="w-full bg-transparent border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[100px]"
        />
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mt-1 text-right tabular-nums">
          {reason.length} / 1000
        </div>
      </div>

      {error ? (
        <div className="text-xs text-red-600 font-light">{error}</div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || reason.trim().length === 0}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-800 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
        >
          {pending ? "Filing…" : "File dispute"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          disabled={pending}
          className="rounded-lg border border-black/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black hover:border-black/35 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
