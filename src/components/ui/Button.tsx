"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonBase =
  "group inline-flex items-center justify-center font-mono uppercase tracking-[0.14em] transition-all select-none whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20";

const buttonVariants = cva(buttonBase, {
  variants: {
    variant: {
      primary:
        "bg-[#0a0a0a] text-white hover:bg-black/85 border border-[#0a0a0a]",
      secondary:
        "bg-white text-[#0a0a0a] hover:bg-black/[0.04] border border-black/15",
      ghost:
        "bg-transparent text-black/60 hover:text-black hover:bg-black/[0.04] border border-transparent",
      danger:
        "bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 border border-[#ef4444]/25",
    },
    size: {
      sm: "text-[9px] h-7 rounded-full pl-3 pr-3 gap-2",
      md: "text-[10px] h-9 rounded-full pl-4 pr-3 gap-2",
      lg: "text-[11px] h-11 rounded-full pl-6 pr-4 gap-3",
      xl: "text-[12px] h-14 rounded-full pl-8 pr-5 gap-4",
    },
    shape: {
      pill: "",
      icon: "aspect-square p-0 !px-0",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
    shape: "pill",
  },
});

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    withArrow?: boolean;
    endIcon?: React.ReactNode;
    startIcon?: React.ReactNode;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant,
      size,
      shape,
      withArrow,
      endIcon,
      startIcon,
      children,
      ...rest
    },
    ref,
  ) {
    const iconCircleBase =
      "inline-flex items-center justify-center rounded-full shrink-0 transition-all";
    const iconCircleSize =
      size === "lg"
        ? "w-7 h-7"
        : size === "xl"
          ? "w-8 h-8"
          : size === "sm"
            ? "w-4 h-4"
            : "w-5 h-5";
    const iconCircleColors =
      variant === "secondary" || variant === "ghost"
        ? "bg-[#0a0a0a] text-white group-hover:translate-x-0.5"
        : "bg-white text-[#0a0a0a] group-hover:translate-x-0.5";

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, shape }), className)}
        {...rest}
      >
        {startIcon ? (
          <span className="inline-flex items-center">{startIcon}</span>
        ) : null}
        <span>{children}</span>
        {withArrow ? (
          <span className={cn(iconCircleBase, iconCircleSize, iconCircleColors)}>
            <ArrowRight
              className={cn(
                size === "sm"
                  ? "w-2.5 h-2.5"
                  : size === "lg" || size === "xl"
                    ? "w-3.5 h-3.5"
                    : "w-3 h-3",
              )}
              strokeWidth={2.4}
            />
          </span>
        ) : null}
        {endIcon ? <span className="inline-flex">{endIcon}</span> : null}
      </button>
    );
  },
);
