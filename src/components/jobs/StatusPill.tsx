import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/jobs";

const TONE: Record<string, { bg: string; fg: string; dot: string }> = {
  OPEN:              { bg: "bg-[#0a0a0a]/[0.04]", fg: "text-[#0a0a0a]", dot: "bg-[#0a0a0a]" },
  ASSIGNED:          { bg: "bg-blue-500/[0.08]", fg: "text-blue-700",  dot: "bg-blue-600" },
  IN_PROGRESS:       { bg: "bg-amber-500/[0.10]", fg: "text-amber-700", dot: "bg-amber-500" },
  READY_FOR_PICKUP:  { bg: "bg-emerald-500/[0.10]", fg: "text-emerald-700", dot: "bg-emerald-500" },
  PICKED_UP:         { bg: "bg-emerald-500/[0.10]", fg: "text-emerald-700", dot: "bg-emerald-500" },
  COMPLETED:         { bg: "bg-emerald-500/[0.10]", fg: "text-emerald-700", dot: "bg-emerald-500" },
  CANCELLED:         { bg: "bg-black/[0.05]", fg: "text-black/45", dot: "bg-black/30" },
  DISPUTED:          { bg: "bg-red-500/[0.08]", fg: "text-red-700", dot: "bg-red-500" },
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const tone = TONE[status] ?? TONE.OPEN;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full font-mono uppercase tracking-[0.16em] text-[10px] border border-black/[0.06]",
        tone.bg,
        tone.fg,
        className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", tone.dot)} />
      {statusLabel(status)}
    </span>
  );
}
