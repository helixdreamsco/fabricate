import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatGbp } from "@/lib/money";

export type TestStripInitiator = "paid" | "creator_requested" | "maker_offered";

/**
 * Verification test strip card. Each Job carries a unique HD-XXXXXX code; a
 * stencil with that code engraved can be printed and photographed alongside
 * the finished part. The card surfaces in three contexts:
 *
 *   1. Creator paid for it at checkout.
 *   2. Creator requested one mid-flight (typically free, after a print
 *      issue).
 *   3. Maker preemptively offered one.
 *
 * On the maker side, the card is shown unconditionally — they always have
 * the option to print a verification stencil. On the creator side, the
 * caller decides whether to render this card at all.
 */
export function TestStripCard({
  code,
  initiator,
  feePence,
  audience,
}: {
  code: string;
  initiator: TestStripInitiator | null;
  feePence: number;
  audience: "creator" | "maker";
}) {
  const stlHref = `/api/test-print/${encodeURIComponent(code)}`;

  let pillCopy: string;
  let pillTone: "emerald" | "indigo" | "amber" | "neutral";
  switch (initiator) {
    case "paid":
      pillCopy = `Included · ${formatGbp(feePence)}`;
      pillTone = "emerald";
      break;
    case "creator_requested":
      pillCopy =
        audience === "creator" ? "You requested this" : "Creator requested";
      pillTone = "amber";
      break;
    case "maker_offered":
      pillCopy =
        audience === "maker" ? "You offered this" : "Maker is providing";
      pillTone = "indigo";
      break;
    case null:
      pillCopy = "Optional";
      pillTone = "neutral";
      break;
  }

  const description =
    audience === "maker"
      ? "Print this stencil and photograph it next to the finished part. The creator will cross-check the engraved code against their order."
      : "The maker prints this stencil and photographs it next to your finished part as proof their printer is working correctly.";

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
          Test strip
        </div>
        <Pill tone={pillTone}>{pillCopy}</Pill>
      </div>

      <div className="font-mono text-2xl tracking-[0.18em] tabular-nums select-all">
        {code}
      </div>

      <p className="text-[12px] font-light text-black/65 mt-2 leading-snug">
        {description}
      </p>

      <a
        href={stlHref}
        download={`test-strip-${code}.stl`}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-black/[0.12] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/70 hover:border-black/40 hover:text-black transition-colors"
      >
        <Download className="w-3 h-3" strokeWidth={2.2} />
        Download stencil STL
      </a>
    </Card>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "emerald" | "indigo" | "amber" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-800 border-emerald-500/30"
      : tone === "indigo"
        ? "bg-indigo-500/10 text-indigo-800 border-indigo-500/30"
        : tone === "amber"
          ? "bg-amber-500/10 text-amber-800 border-amber-500/30"
          : "bg-black/[0.04] text-black/55 border-black/[0.08]";
  const dotCls =
    tone === "emerald"
      ? "bg-emerald-600"
      : tone === "indigo"
        ? "bg-indigo-600"
        : tone === "amber"
          ? "bg-amber-600"
          : "bg-black/30";
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] text-[10px] border ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
      {children}
    </div>
  );
}
