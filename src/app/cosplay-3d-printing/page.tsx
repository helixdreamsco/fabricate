import type { Metadata } from "next";
import Link from "next/link";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Button } from "@/components/ui/Button";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/landing/Footer";
import { LandingDropzone } from "@/components/landing/LandingDropzone";

const TITLE = "Cosplay 3D Printing in London · Props, armour & weapon replicas";
const DESCRIPTION =
  "Print your cosplay in London. Upload your prop, armour or weapon file and a local maker prints it in PLA, PETG or resin. Pickup or courier. Built for con-week deadlines.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/cosplay-3d-printing" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/cosplay-3d-printing",
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
    name: "Cosplay 3D Printing",
    serviceType: "Cosplay Prop & Armour 3D Printing",
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
    audience: {
      "@type": "Audience",
      audienceType: "Cosplayers, prop makers, costume designers",
    },
    description: DESCRIPTION,
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What materials work best for cosplay 3D printing?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "PLA is the workhorse — cheap, easy to sand and paint, perfect for armour panels and large props. PETG is slightly tougher and better for parts that flex (greaves, gauntlets). Resin SLA is for high-detail pieces like masks, jewellery, and weapon details. Pick the primary in checkout; the maker confirms availability.",
        },
      },
      {
        "@type": "Question",
        name: "How big can a single cosplay print be?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Standard FDM print volumes are around 256mm x 256mm x 256mm — large enough for most armour panels in one piece, or a helmet split into 2–3 sections. For bigger pieces, split the model in your slicer or upload the segmented STLs as a multi-part job.",
        },
      },
      {
        "@type": "Question",
        name: "How fast can I get cosplay parts printed in London?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Small props print in a few hours; full armour sets typically take 1–3 days of print time, plus the maker's queue. Most cosplay jobs are picked up within 48–96 hours of posting. If you have a con deadline, flag it in the notes and makers will bid accordingly.",
        },
      },
      {
        "@type": "Question",
        name: "Can you print cosplay weapons in the UK?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes — replica weapons for cosplay use (clearly non-functional props). UK law requires realistic imitation firearms to be sold only with proof of cosplay/theatrical use; check our Acceptable Use Policy. Swords, staves, fantasy weapons and clearly stylised pieces are no issue.",
        },
      },
      {
        "@type": "Question",
        name: "Do you finish the prints (sanding, primer, paint)?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Right now Fabricate is print-only — you pick it up off the bed (lightly trimmed). Many makers can negotiate sanding, priming, or smoothing finishes directly in chat as add-ons. Full paint-jobs are typically left to the cosplayer.",
        },
      },
    ],
  },
];

const PIECES = [
  { label: "Armour", body: "Pauldrons, chest plates, greaves, gauntlets." },
  { label: "Helmets & masks", body: "Single-piece or segmented for detail." },
  { label: "Weapons & staves", body: "Replica swords, blasters, magical foci." },
  { label: "Accessories", body: "Brooches, buckles, insignia, jewellery." },
  { label: "Wearable pieces", body: "Horns, wings, ears, tail components." },
  { label: "Show props", body: "Performance pieces for drag, theatre, photo shoots." },
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
              London makers · live
            </MonoLabel>
          </div>
          <MonoLabel size="sm">For cosplayers and prop makers</MonoLabel>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95] max-w-5xl">
          Cosplay, printed.
          <br />
          <span className="text-black/45">By people in London.</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg md:text-xl font-light text-black/60 leading-relaxed">
          Upload your prop, armour, helmet, or weapon file and a local maker
          prints it — PLA for big armour pieces, resin for fine detail. Built
          around con deadlines: bids in hours, prints in days, pickup nearby
          (or courier). One piece or a full set.
        </p>

        <div className="mt-10">
          <LandingDropzone source="cosplay" />
        </div>
      </section>

      <section className="border-y border-black/[0.06] bg-white">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-14">
          <MonoLabel size="md" className="mb-6 block">
            What we print
          </MonoLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PIECES.map((u) => (
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
          Materials & finish
        </MonoLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step
            idx="PLA"
            title="The workhorse."
            body="Cheap, easy to sand, takes primer and paint beautifully. Default for large armour panels and props that don't need to flex."
          />
          <Step
            idx="PETG"
            title="Tougher, slightly flexible."
            body="Better for parts that take stress in wear — greaves, gauntlets, anything that bends. Slightly harder to finish than PLA."
          />
          <Step
            idx="Resin"
            title="High-detail."
            body="For masks, jewellery, weapon details, anything with intricate features. Smaller build volumes — usually split the model first."
          />
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-5 md:px-8 pb-20">
        <MonoLabel size="md" className="mb-6 block">
          Cosplay questions
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
              Upload your cosplay file
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
    <Card className="p-6 md:p-8 flex flex-col gap-5 min-h-[240px]">
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
    q: "Which material should I pick for cosplay?",
    a: "PLA for most armour and big props (easy to finish), PETG for parts that flex, resin for fine details and masks. Pick the primary on checkout and the maker will confirm.",
  },
  {
    q: "How big can a single piece be?",
    a: "Standard print bed is around 256mm cubed — most armour fits in one piece, helmets usually split into 2–3 sections. For bigger pieces, segment in your slicer.",
  },
  {
    q: "Can I print a weapon prop?",
    a: "Fantasy weapons, swords, staves, blasters — yes. Realistic imitation firearms have UK legal restrictions; see Acceptable Use Policy.",
  },
  {
    q: "How fast can I get a full set?",
    a: "Single props in hours; full armour sets in 1–3 days of print time plus queue. Mention your con date in notes and makers will quote against it.",
  },
  {
    q: "Do makers finish the parts?",
    a: "Print-only by default. Many makers will negotiate sanding/priming as add-ons in chat. Final paint is usually on the cosplayer.",
  },
  {
    q: "What if I don't have a model?",
    a: "Right now you need an STL or STEP. Designer-on-Fabricate (commissioning the model itself) is on the roadmap — for now, pair with a freelance modeller.",
  },
];
