"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, Props>(function Input(
  { className, mono, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={cn(
        "bg-transparent w-full border-b border-black/15 pb-1.5 text-sm font-light outline-none",
        "placeholder:text-black/25 focus:border-black/50 transition-colors",
        "disabled:opacity-50",
        mono && "font-mono text-[13px] tracking-wide",
        className,
      )}
    />
  );
});
