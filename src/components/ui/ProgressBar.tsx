import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
  tone = "black",
  thickness = "thin",
}: {
  value: number;
  className?: string;
  tone?: "black" | "success" | "warn";
  thickness?: "hair" | "thin" | "thick";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const h = thickness === "hair" ? "h-px" : thickness === "thick" ? "h-1" : "h-0.5";
  const fill =
    tone === "success"
      ? "bg-[#10b981]"
      : tone === "warn"
        ? "bg-[#f59e0b]"
        : "bg-[#0a0a0a]";
  return (
    <div className={cn("w-full bg-black/[0.08] rounded-full overflow-hidden", h, className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500 ease-out", fill)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
