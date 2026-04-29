import Link from "next/link";
import { cn } from "@/lib/utils";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ModeToggle } from "./ModeToggle";
import { NotificationBell } from "./NotificationBell";
import { HelixLogo } from "./HelixLogo";

export async function TopNav() {
  const session = await auth();
  const user = session?.user ?? null;
  // Market is a maker-only surface — only show the link to users who have
  // a MakerProfile. Creators see Upload + My jobs instead.
  let isMaker = false;
  if (user?.id) {
    const profile = await prisma.makerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    isMaker = !!profile;
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-black/[0.06] bg-white/80 backdrop-blur-md">
      <div className="max-w-[1600px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 group"
          aria-label="Fabricate home"
        >
          <HelixLogo
            size={26}
            className="group-hover:rotate-180 transition-transform duration-500"
          />
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#0a0a0a] font-bold">
            Fabricate
          </div>
        </Link>

        {/* Center: marketing nav (unauth) or Creator/Maker mode toggle (auth) */}
        {user ? (
          <div className="hidden md:flex">
            <ModeToggle />
          </div>
        ) : (
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-full border border-black/10 bg-white">
            <NavPill href="/#top" label="Upload" />
            <NavPill href="/#how-it-works" label="How it works" />
            <NavPill href="/makers" label="For makers" />
            <NavPill href="/#network" label="Network" />
          </nav>
        )}

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/"
                className="hidden md:inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black transition-colors"
              >
                Upload
              </Link>
              <Link
                href="/jobs"
                className="hidden md:inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black transition-colors"
              >
                My jobs
              </Link>
              {isMaker ? (
                <Link
                  href="/market"
                  className="hidden md:inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black transition-colors"
                >
                  Market
                </Link>
              ) : null}
              <Link
                href="/communities"
                className="hidden md:inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black transition-colors"
              >
                Communities
              </Link>
            </>
          ) : (
            <Link
              href="/track"
              className="hidden md:inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black transition-colors"
            >
              Track order
            </Link>
          )}
          {user ? <NotificationBell /> : null}
          {user ? (
            <Link
              href="/account"
              className="inline-flex items-center gap-2 h-8 pl-1 pr-3 rounded-full border border-black/15 bg-white hover:bg-black/[0.04] transition-colors"
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={user.name ?? user.email ?? "Account"}
                  className="w-6 h-6 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-[#0a0a0a] text-white text-[10px] font-bold flex items-center justify-center">
                  {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a] max-w-[120px] truncate">
                {user.name?.split(" ")[0] ?? user.email ?? "Account"}
              </span>
            </Link>
          ) : (
            <Link
              href="/account"
              className="inline-flex items-center gap-2 h-8 pl-3 pr-3 rounded-full border border-black/15 bg-white hover:bg-black/[0.04] transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]">
                Sign in
              </span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "font-mono uppercase tracking-[0.14em] text-[10px] px-3 py-1.5 rounded-full transition-all",
        "text-black/50 hover:text-black hover:bg-black/[0.04]",
      )}
    >
      {label}
    </Link>
  );
}

