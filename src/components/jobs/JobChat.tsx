"use client";
import * as React from "react";
import { Send, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SerializedJobMessage } from "@/lib/jobs";

export function JobChat({
  jobId,
  viewerId,
  initialMessages,
}: {
  jobId: string;
  viewerId: string;
  initialMessages: SerializedJobMessage[];
}) {
  const [messages, setMessages] = React.useState<SerializedJobMessage[]>(initialMessages);
  const [draft, setDraft] = React.useState("");
  const [pendingImage, setPendingImage] = React.useState<{
    file: File;
    previewUrl: string;
    uploaded?: { imageUrl: string; imageMime: string };
    uploading?: boolean;
    error?: string;
  } | null>(null);
  const [sending, setSending] = React.useState(false);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // SSE: append new messages as they arrive.
  React.useEffect(() => {
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    const onMsg = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "message:new") {
          setMessages((m) => (m.find((x) => x.id === data.message.id) ? m : [...m, data.message]));
        }
      } catch {
        /* ignore */
      }
    };
    es.addEventListener("message:new", onMsg as EventListener);
    return () => {
      es.removeEventListener("message:new", onMsg as EventListener);
      es.close();
    };
  }, [jobId]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Revoke object URLs when image preview changes / unmounts to avoid leaks.
  React.useEffect(() => {
    return () => {
      if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage?.previewUrl]);

  async function pickImage() {
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPendingImage({
        file,
        previewUrl: URL.createObjectURL(file),
        error: "Pick an image file (jpg/png/webp/gif).",
      });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ file, previewUrl, uploading: true });

    try {
      const resized = await resizeImageBlob(file, 1600, 0.85);
      const fd = new FormData();
      fd.append("file", resized, file.name.replace(/\.[^.]+$/, ".jpg"));
      const r = await fetch("/api/uploads/image", { method: "POST", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setPendingImage((p) =>
          p ? { ...p, uploading: false, error: j.error ?? `upload failed (${r.status})` } : p,
        );
        return;
      }
      const j = await r.json();
      setPendingImage((p) =>
        p ? { ...p, uploading: false, uploaded: { imageUrl: j.imageUrl, imageMime: j.imageMime } } : p,
      );
    } catch (err) {
      setPendingImage((p) =>
        p ? { ...p, uploading: false, error: err instanceof Error ? err.message : "upload error" } : p,
      );
    }
  }

  function clearPendingImage() {
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }

  async function send() {
    const body = draft.trim();
    const image = pendingImage?.uploaded;
    if (!body && !image) return;
    if (sending) return;
    if (pendingImage && pendingImage.uploading) return; // wait for upload
    if (pendingImage && pendingImage.error) return;     // dismiss the image first
    setSending(true);
    setDraft("");
    const stash = { body, image };
    clearPendingImage();
    try {
      const r = await fetch(`/api/jobs/${jobId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: stash.body,
          imageUrl: stash.image?.imageUrl ?? null,
          imageMime: stash.image?.imageMime ?? null,
        }),
      });
      if (!r.ok) setDraft(stash.body); // restore on failure
    } catch {
      setDraft(stash.body);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[280px]">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-h-[420px]"
      >
        {messages.length === 0 ? (
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/35 text-center py-8">
            No messages yet — start the conversation.
          </div>
        ) : null}
        {messages.map((m) => {
          const mine = m.authorId === viewerId;
          return (
            <div
              key={m.id}
              className={cn("flex gap-2", mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[78%] px-3 py-2 rounded-2xl text-sm font-light leading-relaxed",
                  mine
                    ? "bg-[#0a0a0a] text-white rounded-br-md"
                    : "bg-black/[0.04] text-[#0a0a0a] rounded-bl-md",
                )}
              >
                {!mine ? (
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mb-0.5">
                    {m.authorName ?? "Unknown"}
                  </div>
                ) : null}
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.imageUrl}
                    alt="attachment"
                    className={cn(
                      "max-w-full rounded-xl cursor-zoom-in",
                      m.body ? "mb-1.5" : "",
                    )}
                    style={{ maxHeight: 320 }}
                    onClick={() => setLightboxUrl(m.imageUrl)}
                  />
                ) : null}
                {m.body ? (
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                ) : null}
                <div
                  className={cn(
                    "font-mono text-[9px] uppercase tracking-[0.16em] mt-1",
                    mine ? "text-white/45" : "text-black/35",
                  )}
                >
                  {new Date(m.createdAt).toLocaleString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending image preview */}
      {pendingImage ? (
        <div className="px-3 pt-2 border-t border-black/[0.08]">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage.previewUrl}
              alt="preview"
              className={cn(
                "rounded-lg border border-black/[0.08]",
                pendingImage.uploading && "opacity-60",
              )}
              style={{ maxHeight: 80 }}
            />
            <button
              type="button"
              onClick={clearPendingImage}
              className="absolute -top-2 -right-2 w-6 h-6 inline-flex items-center justify-center rounded-full bg-black/80 text-white shadow-sm hover:bg-black"
              aria-label="Remove image"
            >
              <X className="w-3 h-3" strokeWidth={2.4} />
            </button>
            {pendingImage.uploading ? (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.18em] text-black/65">
                Uploading…
              </div>
            ) : null}
          </div>
          {pendingImage.error ? (
            <div className="text-xs text-red-600 font-light mt-1">
              {pendingImage.error}
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-black/[0.08] px-3 py-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={onFileSelected}
        />
        <button
          type="button"
          onClick={pickImage}
          disabled={sending || (pendingImage?.uploading ?? false)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full text-black/55 hover:text-black hover:bg-black/[0.06] disabled:opacity-40 transition-colors"
          aria-label="Attach image"
          title="Attach image"
        >
          <ImageIcon className="w-4 h-4" strokeWidth={2.2} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={pendingImage ? "Caption (optional)…" : "Type a message…"}
          className="flex-1 bg-transparent text-sm font-light outline-none placeholder:text-black/30 py-2"
          maxLength={2000}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={
            sending
            || (pendingImage?.uploading ?? false)
            || (!draft.trim() && !pendingImage?.uploaded)
          }
          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#0a0a0a] text-white disabled:opacity-30 active:scale-95 transition-transform"
          aria-label="Send"
        >
          <Send className="w-3.5 h-3.5" strokeWidth={2.4} />
        </button>
      </form>

      {/* Lightbox */}
      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="full size"
            className="max-w-[96vw] max-h-[92vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={2.2} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Resize an image File down to `maxDim` on the long edge using a canvas,
 * encode as JPEG at the given quality. Used to keep chat uploads light
 * regardless of the source resolution (modern phone cameras = ~50 MP).
 *
 * Falls back to the original blob if the browser can't decode the image
 * (e.g. unsupported format) or canvas encoding fails.
 */
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
