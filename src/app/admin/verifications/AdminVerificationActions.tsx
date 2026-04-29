"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

export function AdminVerificationActions({ verificationId }: { verificationId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const approve = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/verifications/${verificationId}/approve`,
        { method: "POST" },
      );
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

  const reject = async () => {
    if (reason.trim().length === 0) {
      setError("Reason required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/verifications/${verificationId}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
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
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={approve}
          disabled={pending}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
        >
          {pending && !rejecting ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => setRejecting((r) => !r)}
          disabled={pending}
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-red-800 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
        >
          Reject…
        </button>
      </div>
      {rejecting ? (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (visible to maker)"
            maxLength={500}
            className="w-full bg-transparent border border-black/15 rounded-md p-2 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[50px]"
          />
          <button
            type="button"
            onClick={reject}
            disabled={pending}
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-red-800 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            {pending ? "Rejecting…" : "Confirm rejection"}
          </button>
        </div>
      ) : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
