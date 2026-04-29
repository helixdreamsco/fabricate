"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

type Message = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  evidenceUrl: string | null;
  createdAt: string;
};

export function DisputeThread({
  jobId,
  disputeId,
  canReply,
  viewerId,
  messages,
}: {
  jobId: string;
  disputeId: string;
  canReply: boolean;
  viewerId: string;
  messages: Message[];
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/jobs/${jobId}/disputes/${disputeId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `failed (${res.status})`);
      }
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      {messages.length > 0 ? (
        <ul className="space-y-2">
          {messages.map((m) => {
            const isMine = m.authorId === viewerId;
            return (
              <li
                key={m.id}
                className={
                  isMine
                    ? "rounded-lg bg-black/[0.03] border border-black/[0.06] p-3 ml-8"
                    : "rounded-lg bg-amber-50/40 border border-amber-200/60 p-3 mr-8"
                }
              >
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mb-1">
                  {isMine ? "You" : m.authorName} ·{" "}
                  {new Date(m.createdAt).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
                {m.body ? (
                  <div className="text-sm font-light text-black/80 whitespace-pre-wrap">
                    {m.body}
                  </div>
                ) : null}
                {m.evidenceUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.evidenceUrl}
                    alt="Evidence"
                    className="mt-2 rounded-md border border-black/[0.08] max-w-full"
                    style={{ maxHeight: 280 }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {canReply ? (
        <form onSubmit={onSubmit} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Reply to the dispute…"
            maxLength={2000}
            className="w-full bg-transparent border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[60px]"
          />
          {error ? (
            <div className="text-xs text-red-600 font-light">{error}</div>
          ) : null}
          <button
            type="submit"
            disabled={pending || body.trim().length === 0}
            className="rounded-lg border border-black/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/70 hover:text-black hover:border-black/35 disabled:opacity-50 transition-colors"
          >
            {pending ? "Sending…" : "Reply"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
