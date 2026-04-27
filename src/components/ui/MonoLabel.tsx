import * as React from "react";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md";

const sizeMap: Record<Size, string> = {
  xs: "text-[8px] tracking-[0.22em]",
  sm: "text-[9px] tracking-[0.2em]",
  md: "text-[10px] tracking-[0.18em]",
};

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  size?: Size;
  muted?: boolean;
};

export function MonoLabel({
  children,
  className,
  size = "md",
  muted = true,
  ...rest
}: Props) {
  return (
    <span
      {...rest}
      className={cn(
        "font-mono uppercase",
        sizeMap[size],
        muted ? "text-black/45" : "text-black",
        className,
      )}
    >
      {children}
    </span>
  );
}
