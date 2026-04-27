/**
 * TEST MODE pill — surfaced anywhere a sim-mode payment shows up so it's
 * impossible to confuse a fake transaction with a real one.
 */
export function TestModeBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.18em] text-[9px] bg-amber-500/15 text-amber-800 border border-amber-500/30 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Test mode · no real charge
    </span>
  );
}
