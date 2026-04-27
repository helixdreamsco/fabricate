import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";

export default function PrivacyPage() {
  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[800px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <MonoLabel size="md" className="mb-5 block">
          Privacy policy · Draft
        </MonoLabel>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.02] mb-8">
          What we collect,
          <br />
          <span className="text-black/45">and nothing more.</span>
        </h1>
        <div className="prose-content flex flex-col gap-6 text-[15px] font-light text-black/70 leading-relaxed">
          <p>
            This document is a placeholder for the Fabricate privacy policy.
            Before launch, legal will replace every section below with the
            finalised copy reviewed under UK GDPR.
          </p>
          <Section title="1. What we collect">
            Account email, billing address, uploaded STL/3MF mesh files for
            the duration of the print job, and the resulting server-side
            G-code. Mesh files are deleted 30 days after collection unless you
            explicitly save them to your account.
          </Section>
          <Section title="2. What we do not do">
            We do not sell data to third parties. We do not train machine
            learning models on your uploaded designs. Makers never receive
            your billing information.
          </Section>
          <Section title="3. Your rights">
            You can request an export or full deletion of your data at any
            time by emailing{" "}
            <span className="font-mono text-black">privacy@fabricate.co</span>.
          </Section>
          <Section title="4. Draft status">
            This page is a stub added during the build phase. The final policy
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
