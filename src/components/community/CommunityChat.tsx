"use client";
import * as React from "react";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { cn } from "@/lib/utils";
import type { CommunityMessage } from "@/lib/community-types";

export function CommunityChat({
  communityId,
  meUserId,
}: {
  communityId: string;
  meUserId: string;
}) {
  const [messages, setMessages] = React.useState<CommunityMessage[]>([]);
  const [body, setBody] = React.useState("");
  const [connected, setConnected] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const seenIds = React.useRef(new Set<string>());
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Initial load.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(
        `/api/communities/${communityId}/messages?limit=100`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const j = (await res.json()) as { messages: CommunityMessage[] };
      if (!alive) return;
      for (const m of j.messages) seenIds.current.add(m.id);
      setMessages(j.messages);
    })();
    return () => {
      alive = false;
    };
  }, [communityId]);

  // SSE subscription for new messages.
  React.useEffect(() => {
    const es = new EventSource(
      `/api/communities/${communityId}/messages/stream`,
    );
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("message:new", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          message: CommunityMessage;
        };
        if (!seenIds.current.has(data.message.id)) {
          seenIds.current.add(data.message.id);
          setMessages((prev) => [...prev, data.message]);
        }
      } catch {
        /* ignore malformed frame */
      }
    });
    return () => es.close();
  }, [communityId]);

  // Auto-scroll to bottom on new message.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || pending) return;
    setPending(true);
    setBody("");
    try {
      const res = await fetch(`/api/communities/${communityId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const j = await res.json();
      if (res.ok && j?.message && !seenIds.current.has(j.message.id)) {
        // SSE normally delivers this back, but guard against a race.
        seenIds.current.add(j.message.id);
        setMessages((prev) => [...prev, j.message]);
      } else if (!res.ok) {
        setBody(text); // restore on failure
      }
    } catch {
      setBody(text);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="flex flex-col min-h-0 flex-1">
      {/* Header */}
      <div className="px-4 py-3 border-b border-black/[0.06] flex items-center justify-between">
        <MonoLabel size="md" className="!text-black">
          # general
        </MonoLabel>
        <div className="inline-flex items-center gap-2">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              connected ? "bg-[#10b981]" : "bg-black/25",
            )}
          />
          <MonoLabel size="sm">
            {connected ? "Live · SSE" : "Reconnecting…"}
          </MonoLabel>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
            <MonoLabel size="md">No messages yet</MonoLabel>
            <p className="text-[12px] font-light text-black/50 max-w-xs">
              Say hi to kick off the community chat.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <MessageRow
              key={m.id}
              msg={m}
              mine={m.authorId === meUserId}
              grouped={shouldGroup(messages[i - 1], m)}
            />
          ))
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={send}
        className="border-t border-black/[0.06] p-3 flex items-end gap-2"
      >
        <div className="flex-1 rounded-xl border border-black/10 bg-white focus-within:border-black/40 transition-colors px-3 py-2">
          <textarea
            rows={1}
            placeholder="Message the community…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(e as unknown as React.FormEvent);
              }
            }}
            maxLength={2000}
            className="w-full resize-none outline-none text-sm font-light bg-transparent placeholder:text-black/30"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className={cn(
            "shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full transition-all",
            body.trim() && !pending
              ? "bg-[#0a0a0a] text-white hover:bg-black/85 active:scale-[0.95]"
              : "bg-black/[0.06] text-black/30",
          )}
          aria-label="Send"
        >
          <Send className="w-4 h-4" strokeWidth={2.2} />
        </button>
      </form>
    </Card>
  );
}

function shouldGroup(prev: CommunityMessage | undefined, cur: CommunityMessage) {
  if (!prev) return false;
  if (prev.authorId !== cur.authorId) return false;
  const gap =
    new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return gap < 5 * 60 * 1000; // 5 min
}

function MessageRow({
  msg,
  mine,
  grouped,
}: {
  msg: CommunityMessage;
  mine: boolean;
  grouped: boolean;
}) {
  const initial = (msg.authorName ?? "?").charAt(0).toUpperCase();
  const time = new Date(msg.createdAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={cn("flex items-start gap-3", grouped && "mt-[-6px]")}>
      <div className="w-8 shrink-0">
        {grouped ? null : msg.authorImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.authorImage}
            alt={msg.authorName ?? "user"}
            className="w-8 h-8 rounded-full border border-black/10"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-[#0a0a0a] text-white text-[11px] font-bold flex items-center justify-center">
            {initial}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {!grouped ? (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-bold">
              {msg.authorName ?? "Anonymous"}
              {mine ? (
                <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
                  you
                </span>
              ) : null}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/35">
              {time}
            </span>
          </div>
        ) : null}
        <p className="text-sm font-light text-black/85 leading-relaxed whitespace-pre-wrap break-words">
          {msg.body}
        </p>
      </div>
    </div>
  );
}
