import type { Metadata } from "next";
import Link from "next/link";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/landing/Footer";
import { LandingDropzone } from "@/components/landing/LandingDropzone";

const TITLE = "3D Printing in London · Same-week pickup from local makers";
const DESCRIPTION =
  "Get something 3D printed in London. Upload your file, get an instant quote, a nearby maker prints it and you collect — usually within 48 hours. Cosplay, keycaps, jewellery, prototypes. 1 to 10 pieces.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/3d-printing-london" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/3d-printing-london",
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
    name: "3D Printing in London",
    serviceType: "Custom 3D Printing Service",
    provider: {
      "@type": "Organization",
      name: "Fabricate",
      url: "https://fabricate.helixdreams.co",
    },
    areaServed: {
      "@type": "City",
      name: "London",
      containedInPlace: { "@type": "Country", name: "United Kingdom" },
    },
    description: DESCRIPTION,
    offers: {
      "@type": "Offer",
      priceCurrency: "GBP",
      url: "https://fabricate.helixdreams.co/3d-printing-london",
      availability: "https://schema.org/InStock",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How do I get something 3D printed in London?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Upload your STL or STEP file at fabricate.helixdreams.co. A nearby London maker prints it on their machine. You collect it in person — usually within 48 hours.",
        },
      },
      {
        "@type": "Question",
        name: "How fast is 3D printing on Fabricate?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Most jobs are bid on within hours and printed within 24–72 hours of bid acceptance, depending on the part's complexity and the maker's queue.",
        },
      },
      {
        "@type": "Question",
        name: "How much does 3D printing in London cost?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "You see an instant quote when you upload the file. The price covers material, machine time, and a maker margin. The platform fee is currently waived under the launch promo.",
        },
      },
      {
        "@type": "Question",
        name: "What can Fabricate 3D print?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Cosplay props and armour, custom mechanical keycaps, jewellery, fashion accessories, tabletop minis, indie hardware prototypes, architecture models, sculptural art. We don't do industrial production runs or metal printing.",
        },
      },
      {
        "@type": "Question",
        name: "Do you deliver, or is it pickup only?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Pickup is direct from the maker. Courier delivery is also available where the maker supports it — set the delivery option at checkout.",
        },
      },
    ],
  },
];

const USE_CASES = [
  { label: "Cosplay", body: "Props, armour panels, helmets, weapons." },
  { label: "Keycaps", body: "MX and Choc custom caps and full sets." },
  { label: "Jewellery", body: "Statement pieces and accessory hardware." },
  { label: "Minis", body: "D&D, Warhammer, custom terrain, busts." },
  { label: "Prototypes", body: "Pi cases, enclosures, indie hardware." },
  { label: "Fashion", body: "Runway pieces, accessories, set pieces." },
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
              London · live
            </MonoLabel>
          </div>
          <MonoLabel size="sm">Pickup or courier · 1 to 10 pieces</MonoLabel>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95] max-w-5xl">
          3D printing in London,
          <br />
          <span className="text-black/45">done by people nearby.</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg md:text-xl font-light text-black/60 leading-relaxed">
          Drop in your file — STL or STEP. A nearby London maker prints it on
          their own machine and you collect within a couple of days. Cosplay
          props, keycaps, jewellery, minis, prototypes. Small runs of one to
          ten, not factory batches.
        </p>

        <div className="mt-10">
          <LandingDropzone source="3d-printing-london" />
        </div>
      </section>

      <section className="border-y border-black/[0.06] bg-white">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-14">
          <MonoLabel size="md" className="mb-6 block">
            What people print
          </MonoLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {USE_CASES.map((u) => (
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
          How it works
        </MonoLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step
            idx="01"
            title="Upload your file."
            body="Drop in an STL or STEP. We analyse it server-side and give you an instant quote — material, weight, machine time, fair price."
          />
          <Step
            idx="02"
            title="A London maker prints it."
            body="Active makers nearby see your job and bid. You pick the bid based on price, ETA, and reviews. Funds sit in escrow until you collect."
          />
          <Step
            idx="03"
            title="Collect or get it delivered."
            body="Pickup is direct from the maker's address — usually a couple of days. Courier delivery is available where the maker supports it."
          />
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-5 md:px-8 pb-20">
        <MonoLabel size="md" className="mb-6 block">
          Questions
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
              Start your 3D print
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
    <Card className="p-6 md:p-8 flex flex-col gap-5 min-h-[260px]">
      <div className="font-mono text-[40px] font-bold leading-none tracking-tight text-[#0a0a0a]">
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
    q: "How do I get something 3D printed in London?",
    a: "Upload your STL or STEP at fabricate.helixdreams.co. A nearby London maker prints it on their own machine. You collect it in person — usually within 48 hours.",
  },
  {
    q: "How fast is it?",
    a: "Most jobs are bid on within hours and printed within 24–72 hours of bid acceptance, depending on complexity and the maker's queue.",
  },
  {
    q: "How much does it cost?",
    a: "Instant quote on upload — covers material, machine time, and the maker's margin. Platform fee is currently waived under the launch promo.",
  },
  {
    q: "What can you print?",
    a: "Cosplay props, custom keycaps, jewellery, minis, fashion accessories, prototypes, art pieces. Not industrial production, not metal, not regulated goods.",
  },
  {
    q: "What materials do you support?",
    a: "PLA, PETG, ABS, ASA, TPU, and resin (clear, grey, white, black). Specific colour availability depends on which maker takes the job.",
  },
  {
    q: "Do you deliver, or is it pickup only?",
    a: "Pickup is direct from the maker. Courier delivery is available where the maker supports it — set it at checkout.",
  },
];
