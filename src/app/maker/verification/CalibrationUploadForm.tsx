"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

export function CalibrationUploadForm({
  initialUrl,
  alreadySubmitted,
}: {
  initialUrl: string | null;
  alreadySubmitted: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = React.useState<string | null>(initialUrl);
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

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            await upload(f);
          } catch (err) {
            setError(err instanceof Error ? err.message : "upload failed");
          }
        }}
        className="text-sm font-light"
      />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Calibration print"
          className="rounded-md border border-black/[0.08] max-w-full"
          style={{ maxHeight: 220 }}
        />
      ) : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
      <button
        type="submit"
        disabled={!url || pending}
        className="rounded-lg border border-black/[0.15] bg-black text-white px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] disabled:opacity-50"
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
