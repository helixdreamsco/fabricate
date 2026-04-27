"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PickupCodeEntry } from "@/components/jobs/PickupCodeEntry";

/**
 * Creator-side actions:
 *   - Cancel (OPEN/ASSIGNED/IN_PROGRESS) — refunds payment if captured
 *   - Add log entry (any active stage)
 *   - Reverse pickup verification (READY_FOR_PICKUP) — fallback path where
 *     the maker's phone has no camera, the maker shows their code instead.
 */
export function CreatorActions({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [logBody, setLogBody] = React.useState("");
  const [logKind, setLogKind] = React.useState<"log" | "issue">("log");
  const [reverseMode, setReverseMode] = React.useState(false);

  async function cancel() {
    if (!confirm("Cancel this job? If a payment was captured it will be refunded."))
      return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function postLog() {
    if (!logBody.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/log`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: logBody.trim(), kind: logKind }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      setLogBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function mintReverseToken() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/pickup/mint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction: "CREATOR_TO_MAKER" }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      // The reverse direction's display lives on the maker's screen — for the
      // creator side we instead show the entry form (they type the maker's code).
      setReverseMode(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {status === "READY_FOR_PICKUP" ? (
        <Card className="p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
            Pickup
          </div>
          <p className="text-sm font-light text-black/65 mb-3 leading-relaxed">
            Show the QR/code above to the maker at handover. If the maker
            can&rsquo;t scan, switch direction below — the maker will read out
            a code and you can type it here instead.
          </p>
          {!reverseMode ? (
            <Button size="sm" variant="secondary" onClick={mintReverseToken} disabled={busy}>
              Use reverse code (maker shows, I type)
            </Button>
          ) : (
            <PickupCodeEntry jobId={jobId} onSuccess={() => router.refresh()} />
          )}
        </Card>
      ) : null}

      {/* Add log */}
      {["OPEN", "ASSIGNED", "IN_PROGRESS", "READY_FOR_PICKUP"].includes(status) ? (
        <Card className="p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
            Add to timeline
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Button size="sm" variant={logKind === "log" ? "primary" : "secondary"} onClick={() => setLogKind("log")}>
              Note
            </Button>
            <Button size="sm" variant={logKind === "issue" ? "primary" : "secondary"} onClick={() => setLogKind("issue")}>
              Report issue
            </Button>
          </div>
          <textarea
            value={logBody}
            onChange={(e) => setLogBody(e.target.value)}
            placeholder={
              logKind === "issue"
                ? "Describe the issue — wrong colour, dimensions off, late, etc."
                : "Anything you want pinned to the timeline."
            }
            className="w-full bg-transparent border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[64px]"
            maxLength={1000}
          />
          <div className="flex items-center justify-between mt-2">
            <Button size="sm" variant="danger" onClick={cancel} disabled={busy}>
              Cancel job
            </Button>
            <Button size="md" disabled={!logBody.trim() || busy} onClick={postLog}>
              {busy ? "Posting…" : "Post"}
            </Button>
          </div>
          {err ? <div className="mt-3 text-sm text-red-600 font-light">{err}</div> : null}
        </Card>
      ) : null}
    </div>
  );
}
