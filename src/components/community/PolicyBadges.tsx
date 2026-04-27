import { Gift, Zap, Lock, BadgePercent } from "lucide-react";
import { cn } from "@/lib/utils";

type Policy = {
  discountPct: number;
  freeMode: boolean;
  priorityQueue: boolean;
  memberOnlyMakers: boolean;
};

export function PolicyBadges({
  policy,
  className,
}: {
  policy: Policy;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {policy.freeMode ? (
        <Badge icon={<Gift className="w-3 h-3" />} label="Free prints" tone="good" />
      ) : policy.discountPct > 0 ? (
        <Badge
          icon={<BadgePercent className="w-3 h-3" />}
          label={`${policy.discountPct}% off`}
          tone="good"
        />
      ) : null}
      {policy.priorityQueue ? (
        <Badge
          icon={<Zap className="w-3 h-3" />}
          label="Priority queue"
          tone="accent"
        />
      ) : null}
      {policy.memberOnlyMakers ? (
        <Badge
          icon={<Lock className="w-3 h-3" />}
          label="Member-only makers"
          tone="mute"
        />
      ) : null}
    </div>
  );
}

function Badge({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "good" | "accent" | "mute";
}) {
  const colors =
    tone === "good"
      ? "bg-[#10b981]/10 text-[#065f46] border-[#10b981]/25"
      : tone === "accent"
        ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
        : "bg-white text-black/55 border-black/15";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full border font-mono uppercase tracking-[0.14em] text-[9px] whitespace-nowrap",
        colors,
      )}
    >
      {icon}
      {label}
    </span>
  );
}
