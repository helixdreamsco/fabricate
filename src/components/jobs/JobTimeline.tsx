"use client";
import { type SerializedJobEvent } from "@/lib/jobs";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  status_change: "Status",
  log: "Log",
  bid_placed: "Bid placed",
  bid_accepted: "Bid accepted",
  bid_withdrawn: "Bid withdrawn",
  pickup_minted: "Pickup code",
  pickup_verified: "Pickup verified",
  payment_authorized: "Payment authorized",
  payment_captured: "Payment captured",
  payment_refunded: "Payment refunded",
  payout_released: "Payout",
  issue_reported: "Issue",
  message: "Message",
};

const KIND_TONE: Record<string, string> = {
  status_change: "bg-[#0a0a0a]",
  log: "bg-black/40",
  bid_placed: "bg-blue-500",
  bid_accepted: "bg-emerald-500",
  bid_withdrawn: "bg-black/30",
  pickup_minted: "bg-amber-500",
  pickup_verified: "bg-emerald-500",
  payment_authorized: "bg-blue-500",
  payment_captured: "bg-emerald-500",
  payment_refunded: "bg-black/40",
  payout_released: "bg-emerald-500",
  issue_reported: "bg-red-500",
  message: "bg-black/40",
};

export function JobTimeline({ events }: { events: SerializedJobEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="border border-dashed border-black/15 rounded-xl px-6 py-10 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
          No activity yet
        </div>
      </div>
    );
  }
  return (
    <ol className="space-y-3.5">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3">
          <div className="flex flex-col items-center pt-1.5">
            <span className={cn("w-2 h-2 rounded-full", KIND_TONE[e.kind] ?? "bg-black/40")} />
            <span className="w-px flex-1 bg-black/[0.08] mt-1.5 min-h-3" />
          </div>
          <div className="flex-1 pb-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/55">
                {KIND_LABEL[e.kind] ?? e.kind}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/35">
                {new Date(e.createdAt).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "short",
                })}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/35">
                · {e.actor}
              </span>
            </div>
            <div className="text-sm font-light text-black/80 mt-0.5 leading-relaxed">
              {e.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
