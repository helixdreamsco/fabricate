import { Star } from "lucide-react";

/**
 * Inline rating chip for maker rows. Renders nothing when count is 0 — we
 * don't want to anchor creators on "no reviews yet" since absence is
 * ambiguous (new maker vs avoided).
 */
export function MakerRatingBadge({
  rating,
  size = "sm",
}: {
  rating: { avg: number; count: number } | null;
  size?: "sm" | "md";
}) {
  if (!rating || rating.count === 0) return null;
  const fontSize = size === "md" ? "text-xs" : "text-[10px]";
  const iconSize = size === "md" ? "w-3 h-3" : "w-2.5 h-2.5";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] ${fontSize} bg-amber-500/10 text-amber-800 border border-amber-500/30 tabular-nums`}
      title={`${rating.avg.toFixed(2)} average from ${rating.count} review${rating.count === 1 ? "" : "s"}`}
    >
      <Star className={`${iconSize} fill-amber-500 text-amber-500`} strokeWidth={1.5} />
      {rating.avg.toFixed(1)} ({rating.count})
    </span>
  );
}
