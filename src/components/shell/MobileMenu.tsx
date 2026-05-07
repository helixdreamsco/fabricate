"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Menu,
  X,
  Upload,
  ListChecks,
  Users,
  Compass,
  Hammer,
  Wallet,
  Bell,
  ShieldCheck,
  User as UserIcon,
  LogOut,
  ArrowRight,
  MapPin,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  signedIn: boolean;
  isMaker: boolean;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

export function MobileMenu(props: Props) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname() ?? "/";

  // Close on route change.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Body scroll lock while drawer is open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-black/15 bg-white hover:bg-black/[0.04] transition-colors -mr-1"
      >
        <Menu className="w-[18px] h-[18px]" strokeWidth={2.2} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] md:hidden h-[100dvh]">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/35 backdrop-blur-sm cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="absolute right-0 top-0 w-[88vw] max-w-[360px] h-[100dvh] bg-white shadow-2xl flex flex-col"
          >
            <Header
              onClose={() => setOpen(false)}
              userName={props.userName}
              userEmail={props.userEmail}
              userImage={props.userImage}
              signedIn={props.signedIn}
            />

            <div className="flex-1 min-h-0 overflow-y-auto py-2">
              {props.signedIn ? (
                <SignedInGroups isMaker={props.isMaker} pathname={pathname} />
              ) : (
                <SignedOutGroup pathname={pathname} />
              )}
            </div>

            <Footer signedIn={props.signedIn} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Header({
  onClose,
  signedIn,
  userName,
  userEmail,
  userImage,
}: {
  onClose: () => void;
  signedIn: boolean;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-5 h-14 border-b border-black/[0.06] shrink-0">
      {signedIn ? (
        <>
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userImage}
              alt={userName ?? "Account"}
              className="w-7 h-7 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="w-7 h-7 rounded-full bg-[#0a0a0a] text-white text-[11px] font-bold flex items-center justify-center">
              {(userName ?? userEmail ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium leading-tight truncate">
              {userName ?? userEmail ?? "Account"}
            </div>
            {userEmail && userEmail !== userName ? (
              <div className="text-[11px] font-light text-black/50 truncate">
                {userEmail}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#0a0a0a] font-bold flex-1">
          Menu
        </span>
      )}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="p-2 -mr-2 rounded-full text-black/65 hover:text-black hover:bg-black/[0.04] transition-colors"
      >
        <X className="w-4 h-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}

function Group({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="py-2">
      <div className="px-5 pt-3 pb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-black/40">
        {label}
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.href}>
            <NavRow item={it} active={isActive(pathname, it.href)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-5 py-3 transition-colors",
        active
          ? "bg-[#7c3aed]/[0.07] text-[#7c3aed]"
          : "text-black/80 hover:bg-black/[0.04]",
      )}
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={2.2} />
      <span className="text-sm font-medium flex-1">{item.label}</span>
      {active ? (
        <span
          className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] shrink-0"
          aria-hidden
        />
      ) : null}
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  // "/" should only match the exact root.
  if (href === "/") return pathname === "/";
  // Anchors don't define active state.
  if (href.startsWith("/#")) return false;
  // /maker is its own dashboard — don't let it claim every /maker/*.
  if (href === "/maker") return pathname === "/maker";
  return pathname === href || pathname.startsWith(href + "/");
}

function SignedInGroups({
  isMaker,
  pathname,
}: {
  isMaker: boolean;
  pathname: string;
}) {
  const creator: NavItem[] = [
    { href: "/", label: "Upload a part", icon: Upload },
    { href: "/jobs", label: "My jobs", icon: ListChecks },
    { href: "/track", label: "Track an order", icon: MapPin },
    { href: "/communities", label: "Communities", icon: Users },
  ];
  const maker: NavItem[] = [
    { href: "/maker", label: "Maker dashboard", icon: Compass },
    { href: "/market", label: "Browse market", icon: Hammer },
    { href: "/maker/alerts", label: "Alerts & auto-bid", icon: Bell },
    { href: "/maker/profile", label: "Maker profile", icon: UserIcon },
    { href: "/maker/payouts", label: "Payouts", icon: Wallet },
    { href: "/maker/verification", label: "Verification", icon: ShieldCheck },
  ];
  const account: NavItem[] = [
    { href: "/account", label: "Account", icon: UserIcon },
  ];
  const becomeMaker: NavItem[] = [
    { href: "/makers", label: "Become a maker", icon: Hammer },
  ];
  return (
    <>
      <Group label="Creator" items={creator} pathname={pathname} />
      {isMaker ? (
        <Group label="Maker" items={maker} pathname={pathname} />
      ) : (
        <Group label="Maker" items={becomeMaker} pathname={pathname} />
      )}
      <Group label="Account" items={account} pathname={pathname} />
    </>
  );
}

function SignedOutGroup({ pathname }: { pathname: string }) {
  const items: NavItem[] = [
    { href: "/", label: "Upload a part", icon: Upload },
    { href: "/#how-it-works", label: "How it works", icon: HelpCircle },
    { href: "/makers", label: "For makers", icon: Hammer },
    { href: "/track", label: "Track an order", icon: MapPin },
    { href: "/communities", label: "Communities", icon: Users },
  ];
  return <Group label="Browse" items={items} pathname={pathname} />;
}

function Footer({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="border-t border-black/[0.06] p-4 shrink-0">
      {signedIn ? (
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-black/15 bg-white hover:bg-black/[0.04] font-mono text-[10px] uppercase tracking-[0.18em] text-black/65 hover:text-black transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" strokeWidth={2.2} />
          Sign out
        </button>
      ) : (
        <Link
          href="/account"
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full bg-[#0a0a0a] text-white font-mono text-[10px] uppercase tracking-[0.18em] hover:bg-black/85 transition-colors"
        >
          Sign in
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.2} />
        </Link>
      )}
    </div>
  );
}
