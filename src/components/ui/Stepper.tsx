"use client";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0 p-1 rounded-full border border-black/10 bg-white",
        className,
      )}
    >
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className="w-7 h-7 rounded-full flex items-center justify-center text-black/60 hover:text-black hover:bg-black/[0.04] disabled:opacity-30 disabled:pointer-events-none transition-colors"
        aria-label="Decrease"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <div className="font-mono text-sm text-[#0a0a0a] w-10 text-center tabular-nums">
        {value}
      </div>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        className="w-7 h-7 rounded-full flex items-center justify-center text-black/60 hover:text-black hover:bg-black/[0.04] disabled:opacity-30 disabled:pointer-events-none transition-colors"
        aria-label="Increase"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
