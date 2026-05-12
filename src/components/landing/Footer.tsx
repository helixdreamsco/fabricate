import Link from "next/link";
import { MonoLabel } from "@/components/ui/MonoLabel";

type FooterLink = { label: string; href: string };

const BUYERS: FooterLink[] = [
  { label: "Upload", href: "/#top" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Live network", href: "/#network" },
  { label: "Track an order", href: "/track" },
  { label: "Sign in", href: "/account" },
];

const USE_CASES: FooterLink[] = [
  { label: "3D printing in London", href: "/3d-printing-london" },
  { label: "Cosplay 3D printing", href: "/cosplay-3d-printing" },
  { label: "Custom keycaps", href: "/custom-keycaps" },
  { label: "Communities", href: "/communities" },
];

const MAKERS: FooterLink[] = [
  { label: "Become a maker", href: "/makers" },
  { label: "Earnings estimator", href: "/makers#estimator" },
  { label: "Bridge client", href: "/makers" },
  { label: "Payouts & fees", href: "/makers" },
];

const COMPANY: FooterLink[] = [
  { label: "Network", href: "/#network" },
  { label: "Press", href: "/press" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export function Footer() {
  return (
    <footer className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-20">
      <div className="border-t border-black/[0.08] pt-10 grid grid-cols-2 md:grid-cols-6 gap-8">
        <div className="col-span-2 md:col-span-2">
          <Link
            href="/"
            className="inline-block font-black tracking-tight text-2xl mb-3 hover:opacity-80 transition-opacity"
          >
            Fabricate
          </Link>
          <p className="text-sm font-light text-black/55 max-w-xs">
            3D printing for prototype teams, designers, and students.
            Instant quotes. No back-and-forth.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
            <MonoLabel size="sm" className="!text-black">
              Online · All systems normal
            </MonoLabel>
          </div>
        </div>
        <FooterCol title="Buyers" links={BUYERS} />
        <FooterCol title="Use cases" links={USE_CASES} />
        <FooterCol title="Makers" links={MAKERS} />
        <FooterCol title="Fabricate" links={COMPANY} />
      </div>
      <div className="mt-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-t border-black/[0.06] pt-6">
        <MonoLabel size="sm">© 2026 Fabricate Labs Ltd</MonoLabel>
        <MonoLabel size="sm">Est. 2026 · Independent</MonoLabel>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/35 mb-4">
        {title}
      </div>
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-sm font-light text-black/70 hover:text-black transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
