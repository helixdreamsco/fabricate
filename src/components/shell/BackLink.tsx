import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Standardised "back to X" breadcrumb. Goes at the top of detail / inner
 * pages so mobile users have a clear way out without relying on the
 * browser back button.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-black/55 hover:text-black mb-5 md:mb-6",
        className,
      )}
    >
      <ArrowLeft className="w-3 h-3" /> {label}
    </Link>
  );
}
