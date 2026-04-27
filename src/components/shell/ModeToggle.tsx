"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Creator / Maker dual-sided marketplace toggle.
 *
 * Mode is derived from the URL:
 *   - /maker, /maker/...        → Maker mode
 *   - anything else             → Creator mode
 *   - /makers (public marketing recruiting page) is NOT Maker mode —
 *     that's the pre-signup landing for people considering joining.
 */
export function ModeToggle() {
  const pathname = usePathname() ?? "/";
  const isMakerMode =
    pathname === "/maker" || pathname.startsWith("/maker/");

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-full border border-black/10 bg-white">
      <Link
        href="/"
        aria-current={!isMakerMode ? "page" : undefined}
        className={cn(
          "font-mono uppercase tracking-[0.14em] text-[10px] px-3.5 py-1.5 rounded-full transition-all",
          !isMakerMode
            ? "bg-[#0a0a0a] text-white"
            : "text-black/50 hover:text-black hover:bg-black/[0.04]",
        )}
      >
        Creator
      </Link>
      <Link
        href="/maker"
        aria-current={isMakerMode ? "page" : undefined}
        className={cn(
          "font-mono uppercase tracking-[0.14em] text-[10px] px-3.5 py-1.5 rounded-full transition-all",
          isMakerMode
            ? "bg-[#0a0a0a] text-white"
            : "text-black/50 hover:text-black hover:bg-black/[0.04]",
        )}
      >
        Maker
      </Link>
    </div>
  );
}
