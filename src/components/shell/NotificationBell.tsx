"use client";
import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

type NotifItem = {
  id: string;
  kind: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;

export function NotificationBell() {
  const [items, setItems] = React.useState<NotifItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setItems(j.items ?? []);
      setUnread(j.unreadCount ?? 0);
    } catch {
      // silent
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const markAllRead = async () => {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-full border border-black/15 bg-white hover:bg-black/[0.04] transition-colors"
      >
        <Bell className="w-4 h-4 text-black/65" strokeWidth={2.2} />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-mono font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[480px] overflow-y-auto rounded-xl border border-black/[0.08] bg-white shadow-lg z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                Notifications
              </div>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black underline"
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm font-light text-black/55">
                Nothing new.
              </div>
            ) : (
              <ul>
                {items.map((n) => {
                  const inner = (
                    <div className="px-4 py-3 hover:bg-black/[0.02]">
                      <div className="text-sm font-light text-black/80">{n.body}</div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mt-1">
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                  );
                  return (
                    <li
                      key={n.id}
                      className={
                        n.readAt === null
                          ? "border-l-2 border-blue-500"
                          : "opacity-75"
                      }
                    >
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={async () => {
                            await fetch("/api/notifications/mark-read", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ ids: [n.id] }),
                            });
                            setOpen(false);
                          }}
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-black/[0.06] px-4 py-2 text-right">
              <Link
                href="/account/notifications"
                onClick={() => setOpen(false)}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black"
              >
                Notification settings →
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
