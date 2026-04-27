import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  interactive,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-black/[0.08]",
        interactive &&
          "transition-colors hover:border-black/25 cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardSection({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("p-5 border-b border-black/[0.06] last:border-b-0", className)}>
      {label ? (
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/35 mb-3">
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
}
