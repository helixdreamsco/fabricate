import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

const IG_HANDLE = "@helixdreamsco";
const IG_URL = "https://instagram.com/helixdreamsco";

export default function PressPage() {
  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1000px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <MonoLabel size="md" className="mb-5 block">
          Press kit
        </MonoLabel>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.02] mb-6">
          Covering Fabricate?
          <br />
          <span className="text-black/45">Start here.</span>
        </h1>
        <p className="text-base font-light text-black/60 max-w-xl leading-relaxed mb-10">
          All press, comment, interview and logo-pack enquiries go through
          our founder&rsquo;s Instagram. Send a DM — we&rsquo;ll reply.
        </p>

        <a
          href={IG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-4 rounded-2xl border border-black/[0.08] bg-white pl-3 pr-5 py-3 mb-12 hover:border-black/30 transition-colors"
        >
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#0a0a0a] text-white">
            <InstagramGlyph className="w-4 h-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/45">
              DM on Instagram
            </span>
            <span className="text-lg font-bold tracking-tight">
              {IG_HANDLE}
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/35 group-hover:text-black transition-colors ml-4">
            Open →
          </span>
        </a>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-6">
            <MonoLabel size="md" className="mb-3 block">
              Boilerplate
            </MonoLabel>
            <p className="text-sm font-light text-black/70 leading-relaxed">
              Fabricate is a marketplace that turns any idle desktop 3D
              printer into a bookable service. Creators upload an STL and
              receive a real, server-sliced quote in under a second.
              Independent makers run a lightweight Bridge Client that
              auto-accepts jobs and streams G-code over USB. Founded 2026.
            </p>
          </Card>
          <Card className="p-6">
            <MonoLabel size="md" className="mb-3 block">
              Fast facts
            </MonoLabel>
            <ul className="text-sm font-light text-black/70 leading-relaxed flex flex-col gap-1.5">
              <li>· Founded 2026</li>
              <li>· Category: distributed manufacturing marketplace</li>
              <li>· Core innovation: auto-accept + server-side slicing</li>
              <li>· Privately held</li>
              <li>
                · Press contact:{" "}
                <a
                  href={IG_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-black hover:underline"
                >
                  {IG_HANDLE}
                </a>
              </li>
            </ul>
          </Card>
        </div>

        <div className="mt-14">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Fabricate
          </Link>
        </div>
      </div>
    </div>
  );
}
