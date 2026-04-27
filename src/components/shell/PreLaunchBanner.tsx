import { AlertTriangle } from "lucide-react";

export function PreLaunchBanner() {
  return (
    <div className="w-full bg-[#fef3c7] border-b border-[#f59e0b]/35">
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-2 flex items-start md:items-center gap-2.5">
        <AlertTriangle
          className="w-3.5 h-3.5 text-[#b45309] shrink-0 mt-0.5 md:mt-0"
          strokeWidth={2.2}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7c2d12] leading-tight">
          Pre-launch preview · Not for customers — pending full legal review
          and updated terms & privacy before any public release.
        </span>
      </div>
    </div>
  );
}
