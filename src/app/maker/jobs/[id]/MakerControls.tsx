"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PickupCodeEntry } from "@/components/jobs/PickupCodeEntry";
import { cn } from "@/lib/utils";
import { formatGbp } from "@/lib/money";

type LatestPickup = {
  code: string;
  direction: string;
  expiresAt: string;
  consumedAt: string | null;
};

type CompletionPhoto = {
  required: boolean;
  /** Effective fee paid into the maker's payout. Zero if maker offers free. */
  feePence: number;
  url: string | null;
  uploadedAt: string | null;
};

/**
 * Maker-side controls panel. The visible action depends on job.status:
 *   ASSIGNED          → "Start printing" (→ IN_PROGRESS)
 *   IN_PROGRESS       → "Mark ready for pickup" (→ READY_FOR_PICKUP, mints
 *                       a token automatically)
 *   READY_FOR_PICKUP  → pickup verification panel (scan/type creator's code)
 *   PICKED_UP /        → completion summary
 *   COMPLETED
 *   CANCELLED          → cancellation note
 */
export function MakerControls({
  jobId,
  status,
  latestPickup,
  completionPhoto,
}: {
  jobId: string;
  status: string;
  latestPickup: LatestPickup | null;
  completionPhoto: CompletionPhoto;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [logBody, setLogBody] = React.useState("");
  const [logKind, setLogKind] = React.useState<"log" | "issue">("log");
  const [photoUploading, setPhotoUploading] = React.useState(false);
  const [photoErr, setPhotoErr] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);

  const photoMissing =
    completionPhoto.required && !completionPhoto.url;
  const readyBlockedByPhoto = status === "IN_PROGRESS" && photoMissing;

  async function pushStatus(to: "IN_PROGRESS" | "READY_FOR_PICKUP", note?: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, note: note ?? null }),
      });
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

  async function pickPhoto() {
    photoInputRef.current?.click();
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoErr("Pick an image file (jpg/png/webp).");
      return;
    }
    setPhotoUploading(true);
    setPhotoErr(null);
    try {
      const resized = await resizeImageBlob(file, 1600, 0.85);
      const fd = new FormData();
      fd.append("file", resized, file.name.replace(/\.[^.]+$/, ".jpg"));
      const upRes = await fetch("/api/uploads/image", { method: "POST", body: fd });
      if (!upRes.ok) {
        const j = await upRes.json().catch(() => ({}));
        setPhotoErr(j.error ?? `upload failed (${upRes.status})`);
        return;
      }
      const { imageUrl, imageMime } = await upRes.json();

      const attachRes = await fetch(`/api/jobs/${jobId}/completion-photo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl, imageMime }),
      });
      if (!attachRes.ok) {
        const j = await attachRes.json().catch(() => ({}));
        setPhotoErr(j.error ?? `attach failed (${attachRes.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : "upload error");
    } finally {
      setPhotoUploading(false);
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

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
          Next action
        </div>

        {status === "ASSIGNED" ? (
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="lg" withArrow disabled={busy} onClick={() => pushStatus("IN_PROGRESS")}>
              Start printing
            </Button>
            <span className="text-sm font-light text-black/55">
              Marks the job as in progress and notifies the creator.
            </span>
          </div>
        ) : null}

        {status === "IN_PROGRESS" ? (
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="lg"
                withArrow
                disabled={busy || readyBlockedByPhoto}
                onClick={() => pushStatus("READY_FOR_PICKUP")}
              >
                Mark ready for pickup
              </Button>
              <span className="text-sm font-light text-black/55">
                {readyBlockedByPhoto
                  ? "Upload the completion photo first."
                  : "The creator's 6-digit pickup code is generated automatically."}
              </span>
            </div>
          </div>
        ) : null}

        {status === "READY_FOR_PICKUP" ? (
          <div>
            <div className="text-sm font-light text-black/65 mb-3 leading-relaxed">
              At handover, ask the creator to show their QR or read out the
              6-digit code. Verify here to release your payout.
            </div>
            <PickupCodeEntry jobId={jobId} onSuccess={() => router.refresh()} />
            {latestPickup && latestPickup.direction === "MAKER_TO_CREATOR" && !latestPickup.consumedAt ? (
              <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
                Active code on the creator&rsquo;s screen expires{" "}
                {new Date(latestPickup.expiresAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {status === "PICKED_UP" || status === "COMPLETED" ? (
          <div className="text-sm font-light text-black/70">
            Pickup verified. Payout has been released to your Stripe account.
          </div>
        ) : null}

        {status === "CANCELLED" ? (
          <div className="text-sm font-light text-black/65">
            This job was cancelled by the creator. If a payment was captured
            it has been refunded.
          </div>
        ) : null}

        {err ? (
          <div className="mt-3 text-sm text-red-600 font-light">{err}</div>
        ) : null}
      </Card>

      {/* Completion photo control — only shown when the job requires it */}
      {completionPhoto.required && ["ASSIGNED", "IN_PROGRESS", "READY_FOR_PICKUP"].includes(status) ? (
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
              Completion photo · required
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] tabular-nums text-emerald-700">
              {completionPhoto.feePence > 0
                ? `+${formatGbp(completionPhoto.feePence)} to your payout`
                : "You're offering this free"}
            </div>
          </div>
          <p className="text-sm font-light text-black/65 mb-3 leading-relaxed">
            The creator paid extra to see a photo of the finished print
            before pickup. You can&rsquo;t mark the job ready until you
            upload one.
          </p>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPhotoSelected}
          />

          {completionPhoto.url ? (
            <div className="mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={completionPhoto.url}
                alt="completion"
                className="rounded-lg border border-black/[0.08] max-w-full"
                style={{ maxHeight: 240 }}
              />
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mt-1.5">
                Uploaded {completionPhoto.uploadedAt
                  ? new Date(completionPhoto.uploadedAt).toLocaleString("en-GB", {
                      dateStyle: "medium", timeStyle: "short",
                    })
                  : ""}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="md"
              variant={completionPhoto.url ? "secondary" : "primary"}
              onClick={pickPhoto}
              disabled={photoUploading}
              startIcon={
                completionPhoto.url
                  ? <RefreshCw className={cn("w-3 h-3", photoUploading && "animate-spin")} strokeWidth={2.4} />
                  : <Camera className="w-3 h-3" strokeWidth={2.4} />
              }
            >
              {photoUploading
                ? "Uploading…"
                : completionPhoto.url
                  ? "Replace photo"
                  : "Take / upload photo"}
            </Button>
            {completionPhoto.url ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-700 inline-flex items-center gap-1">
                <Check className="w-3 h-3" strokeWidth={2.4} /> Done
              </span>
            ) : null}
          </div>
          {photoErr ? (
            <div className="mt-2 text-sm text-red-600 font-light">{photoErr}</div>
          ) : null}
        </Card>
      ) : null}

      {/* Add a log entry — useful at any active stage */}
      {["ASSIGNED", "IN_PROGRESS", "READY_FOR_PICKUP"].includes(status) ? (
        <Card className="p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
            Add to timeline
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Button size="sm" variant={logKind === "log" ? "primary" : "secondary"} onClick={() => setLogKind("log")}>
              Update
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
                ? "Describe the issue — printer error, file problem, supply issue…"
                : "e.g. ‘Started slicing — ETA ~6h’ or ‘Layer 90 of 240, looking clean.’"
            }
            className="w-full bg-transparent border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[70px]"
            maxLength={1000}
          />
          <div className="flex justify-end mt-2">
            <Button size="md" disabled={!logBody.trim() || busy} onClick={postLog}>
              {busy ? "Posting…" : logKind === "issue" ? "Report" : "Post update"}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

async function resizeImageBlob(file: File, maxDim: number, quality: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 800_000) return file;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
