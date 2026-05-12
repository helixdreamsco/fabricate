import type { Metadata } from "next";
import Link from "next/link";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/landing/Footer";
import { LandingDropzone } from "@/components/landing/LandingDropzone";

const TITLE = "Custom 3D-Printed Keycaps · MX & Choc · UK";
const DESCRIPTION =
  "Print your own custom mechanical keyboard keycaps in London. Artisan caps, novelty caps, or full sets — MX or Choc. Resin SLA for clean legends, FDM for chunky designs. From a single cap upward.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/custom-keycaps" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/custom-keycaps",
    type: "website",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Custom 3D-Printed Keycaps",
    serviceType: "Mechanical Keyboard Keycap 3D Printing",
    provider: {
      "@type": "Organization",
      name: "Fabricate",
      url: "https://fabricate.helixdreams.co",
    },
    areaServed: {
      "@type": "Country",
      name: "United Kingdom",
    },
    audience: {
      "@type": "Audience",
      audienceType:
        "Mechanical keyboard enthusiasts, custom keyboard builders, artisan keycap collectors",
    },
    description: DESCRIPTION,
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Can I 3D print my own keycaps?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Upload an STL with the MX or Choc stem geometry already modelled (or use one of the open-source templates), pick resin or FDM, and a London maker prints it. From a single artisan cap up to a full 104+ set in one job.",
        },
      },
      {
        "@type": "Question",
        name: "Which print method is best for keycaps?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Resin SLA gives the cleanest legends, sharpest shoulders, and best surface finish — ideal for artisans and double-shot-style caps. FDM (PLA or PETG) is much cheaper and works well for chunky novelty caps where surface texture is less critical.",
        },
      },
      {
        "@type": "Question",
        name: "Do you support MX and Choc switches?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Both — your STL just needs the right stem cutout. We don't generate the stem for you; bring an STL with it already modelled. Most public Cherry MX and Kailh Choc stem templates work straight in.",
        },
      },
      {
        "@type": "Question",
        name: "How long does a keycap order take?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Single artisan keycaps in resin print in 1–4 hours plus curing. Full sets in FDM take longer due to print volume — typically 1–2 days. Most jobs are bid on within hours and delivered within 48–72 hours.",
        },
      },
      {
        "@type": "Question",
        name: "Can I get full keyboard sets printed?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Larger sets (60%, TKL, full-size) just take longer and may route to a maker with multiple printers running in parallel. Note material colour matching across the set in checkout notes if it matters.",
        },
      },
    ],
  },
];

const STYLES = [
  { label: "Artisan caps", body: "Single high-detail showpieces. Resin SLA, sharp legends." },
  { label: "Novelty sets", body: "Themed caps, modifier sets, escape keys, dad-joke runs." },
  { label: "Full sets", body: "60%, TKL, or full-size in matching material and finish." },
  { label: "Replacement caps", body: "When you need just one or two odd-size caps." },
  { label: "Prototype caps", body: "Testing a profile or stem design before tooling at scale." },
  { label: "Macropad sets", body: "Custom layouts, themed pads, streamer decks." },
];

export default function Page() {
  return (
    <>
      <JsonLd data={JSON_LD} />
      <section className="max-w-[1400px] mx-auto px-5 md:px-8 pt-12 md:pt-20 pb-10">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-black/10 bg-white">
            <StatusDot tone="ready" pulse />
            <MonoLabel size="sm" className="!text-black">
              MX & Choc · UK
            </MonoLabel>
          </div>
          <MonoLabel size="sm">From a single cap upward</MonoLabel>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95] max-w-5xl">
          Custom keycaps,
          <br />
          <span className="text-black/45">printed properly.</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg md:text-xl font-light text-black/60 leading-relaxed">
          Drop your keycap STL — single artisan, themed set, or a full 104+
          board. Resin SLA for clean legends and sharp shoulders, FDM for
          chunky novelty caps. MX or Choc, your stem, your design. Printed by
          a London maker, in your hands within a few days.
        </p>

        <div className="mt-10">
          <LandingDropzone source="custom-keycaps" />
        </div>
      </section>

      <section className="border-y border-black/[0.06] bg-white">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-14">
          <MonoLabel size="md" className="mb-6 block">
            What people print
          </MonoLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {STYLES.map((u) => (
              <Card key={u.label} className="p-5 flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
                  {u.label}
                </span>
                <p className="text-sm font-light text-black/70 leading-relaxed">
                  {u.body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-5 md:px-8 py-14 md:py-20">
        <MonoLabel size="md" className="mb-6 block">
          Resin vs FDM
        </MonoLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Step
            idx="Resin"
            title="The clean choice for legends."
            body="Sharper edges, finer surface detail, crisp embossed legends. Best for artisans, double-shot-style caps, and anything where surface feel matters. More expensive per cap but worth it for the showpieces."
          />
          <Step
            idx="FDM"
            title="Affordable and chunky."
            body="PLA or PETG, lower cost per cap, works perfectly for chunky novelty caps, macropad sets, and prototype caps. Layer lines are visible at close range — that's a feature for some designs, a bug for others."
          />
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-5 md:px-8 pb-20">
        <MonoLabel size="md" className="mb-6 block">
          Keycap questions
        </MonoLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQ.map((f) => (
            <Card key={f.q} className="p-6">
              <div className="font-bold text-sm mb-2">{f.q}</div>
              <p className="text-sm font-light text-black/60 leading-relaxed">
                {f.a}
              </p>
            </Card>
          ))}
        </div>

        <div className="mt-10">
          <Link href="/">
            <Button size="lg" withArrow>
              Upload your keycap design
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </>
  );
}

function Step({
  idx,
  title,
  body,
}: {
  idx: string;
  title: string;
  body: string;
}) {
  return (
    <Card className="p-6 md:p-8 flex flex-col gap-5 min-h-[220px]">
      <div className="font-mono text-2xl font-bold leading-none tracking-tight text-[#0a0a0a]">
        {idx}
      </div>
      <h3 className="text-xl md:text-2xl font-black tracking-tight leading-[1.15]">
        {title}
      </h3>
      <p className="text-sm font-light text-black/60 leading-relaxed flex-1">
        {body}
      </p>
    </Card>
  );
}

const FAQ = [
  {
    q: "What stem types are supported?",
    a: "Bring an STL with your stem cutout already modelled — Cherry MX or Kailh Choc. Public templates from the community work fine; we don't generate the stem for you.",
  },
  {
    q: "Can I print a single artisan cap?",
    a: "Yes — that's a popular use case. Resin SLA is usually the right call for a single showpiece. A maker can do it within a day.",
  },
  {
    q: "Can I print a full set in one go?",
    a: "Yes. Bigger sets (TKL, full-size) just take longer. If colour-matching across the set matters, flag it in checkout notes — the maker will batch all of it on one filament.",
  },
  {
    q: "Resin or FDM for novelty caps?",
    a: "If the cap is geometry-heavy with no legend (chunky shapes, sculpted heads, characters), FDM works fine and is cheaper. If it has small text or fine detail, go resin.",
  },
  {
    q: "Can I get caps in multiple colours?",
    a: "Yes — pick a primary on checkout and add notes about secondary colours. Some makers stock filament swap setups; others will quote on a per-colour basis.",
  },
  {
    q: "Do you ship outside London?",
    a: "Pickup is London-only right now. Courier delivery is available where the maker supports it, including to the rest of the UK.",
  },
];
