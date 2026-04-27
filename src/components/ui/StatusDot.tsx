import { cn } from "@/lib/utils";

type Tone = "ready" | "printing" | "warn" | "offline" | "neutral";

const toneMap: Record<Tone, string> = {
  ready: "bg-[#10b981]",
  printing: "bg-[#0a0a0a]",
  warn: "bg-[#f59e0b]",
  offline: "bg-black/25",
  neutral: "bg-black/40",
};

export function StatusDot({
  tone = "neutral",
  pulse,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex w-2 h-2", className)}>
      {pulse ? (
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-40 pulse-soft",
            toneMap[tone],
          )}
        />
      ) : null}
      <span className={cn("relative rounded-full w-2 h-2", toneMap[tone])} />
    </span>
  );
}
