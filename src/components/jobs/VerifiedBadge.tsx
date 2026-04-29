import { ShieldCheck } from "lucide-react";

/** Inline "Verified ✓" badge for makers who completed maker verification. */
export function VerifiedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const fontSize = size === "md" ? "text-xs" : "text-[10px]";
  const iconSize = size === "md" ? "w-3 h-3" : "w-2.5 h-2.5";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] ${fontSize} bg-emerald-500/10 text-emerald-800 border border-emerald-500/30`}
      title="Identity, address, and calibration print verified by Fabricate"
    >
      <ShieldCheck className={iconSize} strokeWidth={2.2} />
      Verified
    </span>
  );
}
