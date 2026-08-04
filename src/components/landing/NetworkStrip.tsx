import { MonoLabel } from "@/components/ui/MonoLabel";

const PARTNERS = [
  "State Tech Hackspace",
  "Metropolitan Making Institute",
  "Riverside Labs",
  "Northside Print Collective",
  "Bay Studios",
  "Central Arts College",
];

export function NetworkStrip() {
  return (
    <section
      id="network"
      className="scroll-mt-16 border-y border-black/[0.06] bg-white/60"
    >
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-6 md:py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <MonoLabel size="md">
            Seeded by the best makerspaces on the network
          </MonoLabel>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {PARTNERS.map((p) => (
              <span
                key={p}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-black/55"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
