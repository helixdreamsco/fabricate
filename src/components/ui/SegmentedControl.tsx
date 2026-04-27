"use client";
import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-full border border-black/10 bg-white",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "font-mono uppercase tracking-[0.14em] text-[10px] px-3 py-1.5 rounded-full transition-all",
              active
                ? "bg-[#0a0a0a] text-white"
                : "text-black/50 hover:text-black",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
