import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";

export default function TermsPage() {
  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[800px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <MonoLabel size="md" className="mb-5 block">
          Terms of service · Draft
        </MonoLabel>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.02] mb-8">
          The deal, in plain English.
        </h1>
        <div className="flex flex-col gap-6 text-[15px] font-light text-black/70 leading-relaxed">
          <p>
            This document is a placeholder for the Fabricate terms. Before
            launch, legal will replace every section below with the finalised
            copy.
          </p>
          <Section title="1. Escrow and payment">
            Funds are charged at checkout and held in Stripe escrow. Release
            happens when you confirm pickup or the courier marks the parcel
            delivered. If a print never arrives or arrives broken, you can
            request a reprint or full refund.
          </Section>
          <Section title="2. What Fabricate is, and isn&rsquo;t">
            Fabricate is a marketplace connecting buyers with independent
            makers who own 3D printers. We are not the manufacturer. Print
            quality, turnaround, and surface finish depend on the maker and
            their hardware. Our dispute process covers defects, not
            disappointment with an inherently limited process.
          </Section>
          <Section title="3. Estimates, not promises">
            Quotes, print times, and pickup ETAs shown in the product are
            estimates. Queues shift, printers fail, couriers run late. We try
            to be accurate and we eat the cost when we miss, but nothing in
            the UI constitutes a legally binding delivery window unless
            explicitly confirmed in writing.
          </Section>
          <Section title="4. What you may not print">
            Firearms components, counterfeit branded parts, content that
            infringes third-party IP, or anything unlawful in England & Wales.
            Uploads are scanned server-side and flagged for review.
          </Section>
          <Section title="5. Draft status">
            This page is a stub added during the build phase. The final terms
            will be published before the first real invoice is sent.
          </Section>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-black/[0.06] pt-6">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
        {title}
      </h2>
      <p>{children}</p>
    </section>
  );
}
