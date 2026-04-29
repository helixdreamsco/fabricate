import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { marked } from "marked";
import { ArrowLeft } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";

export const dynamic = "force-static";

export default async function AcceptableUsePage() {
  const source = await fs.readFile(
    path.join(process.cwd(), "src/content/legal/acceptable-use.md"),
    "utf-8",
  );
  const html = await marked.parse(source);
  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[820px] mx-auto px-5 md:px-8 py-12 md:py-16">
        <MonoLabel size="md" className="mb-3 block">
          Acceptable use policy
        </MonoLabel>
        <article
          className="legal-doc"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Fabricate
        </Link>
      </div>
    </div>
  );
}
