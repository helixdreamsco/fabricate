"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function CalibrationUploadForm({
  initialUrl,
  alreadySubmitted,
}: {
  initialUrl: string | null;
  alreadySubmitted: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = React.useState<string | null>(initialUrl);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileSize, setFileSize] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads/image", { method: "POST", body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `upload failed (${res.status})`);
    }
    const j = await res.json();
    setUrl(j.imageUrl ?? j.fileUrl);
    setFileName(file.name);
    setFileSize(file.size);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/maker/verification/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calibrationPrintUrl: url }),
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

  const [uploading, setUploading] = React.useState(false);
  const fileInputId = "calibration-file";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        id={fileInputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setError(null);
          setUploading(true);
          try {
            await upload(f);
          } catch (err) {
            setError(err instanceof Error ? err.message : "upload failed");
          } finally {
            setUploading(false);
          }
        }}
      />
      <label
        htmlFor={fileInputId}
        className="inline-flex items-center cursor-pointer rounded-lg border border-black/[0.15] bg-white text-[#0a0a0a] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] hover:bg-black/[0.04] transition-colors"
      >
        {uploading ? "Uploading…" : url ? "Replace photo" : "Choose photo"}
      </label>
      {url ? (
        <div className="flex items-center gap-3 rounded-lg border border-black/[0.08] bg-black/[0.02] p-2 max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Calibration print"
            className="rounded-md border border-black/[0.08] object-cover w-16 h-16 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">
              {fileName ?? "Calibration photo"}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/45 mt-0.5">
              {fileSize != null
                ? `${formatBytes(fileSize)} · uploaded`
                : "Uploaded"}
            </div>
          </div>
        </div>
      ) : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
      <button
        type="submit"
        disabled={!url || pending}
        className="block rounded-lg border border-black/[0.15] bg-black text-white px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] disabled:opacity-50"
      >
        {pending
          ? "Submitting…"
          : alreadySubmitted
            ? "Replace and re-submit"
            : "Submit for review"}
      </button>
    </form>
  );
}
