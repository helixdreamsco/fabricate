"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Design / Creator / Maker dual-sided marketplace toggle.
 *
 * Mode is derived from the URL:
 *   - /design, /design/...      → Design mode
 *   - /maker, /maker/...        → Maker mode
 *   - anything else             → Creator mode
 *   - /makers (public marketing recruiting page) is NOT Maker mode —
 *     that's the pre-signup landing for people considering joining.
 */
export function ModeToggle() {
  const pathname = usePathname() ?? "/";
  const mode =
    pathname === "/design" || pathname.startsWith("/design/")
      ? "design"
      : pathname === "/maker" || pathname.startsWith("/maker/")
        ? "maker"
        : "creator";

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-full border border-black/10 bg-white">
      <ModePill href="/design" label="Design" active={mode === "design"} />
      <ModePill href="/" label="Creator" active={mode === "creator"} />
      <ModePill href="/maker" label="Maker" active={mode === "maker"} />
    </div>
  );
}

function ModePill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-mono uppercase tracking-[0.14em] text-[10px] px-3.5 py-1.5 rounded-full transition-all",
        active
          ? "bg-[#0a0a0a] text-white"
          : "text-black/50 hover:text-black hover:bg-black/[0.04]",
      )}
    >
      {label}
    </Link>
  );
}
