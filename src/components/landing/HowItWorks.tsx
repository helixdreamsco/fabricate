import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";

const STEPS = [
  {
    idx: "01",
    title: "We slice it, not you.",
    body: "Drop an STL and our servers compute the real volume, material weight, and print time against each maker's printer profile. You see a real price — not an estimate.",
    detail: "Server-side slicing · CuraEngine & PrusaSlicer profiles",
  },
  {
    idx: "02",
    title: "Routed to a ready printer.",
    body: "Your job goes straight to the nearest maker whose printer is already warm and bed-cleared. No acceptance step. No DMs. No chasing.",
    detail: "Typical first-layer in minutes across the network",
  },
  {
    idx: "03",
    title: "Collect or couriered.",
    body: "Get notified the moment the print is off the bed. Collect from the maker, or opt for a bicycle courier where available.",
    detail: "Pickup · free · wait varies with queue & distance",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="max-w-[1400px] mx-auto px-5 md:px-8 py-16 md:py-28 scroll-mt-16"
    >
      <div className="flex items-end justify-between mb-10 md:mb-14">
        <div>
          <MonoLabel size="md" className="mb-3">
            How it works
          </MonoLabel>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight max-w-2xl leading-[1.05]">
            No chatting with makers.
            <br />
            No manual accepting.
            <br />
            <span className="text-black/45">Just printed.</span>
          </h2>
        </div>
        <div className="hidden md:flex flex-col items-end">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/40">
            From upload → in hand
          </div>
          <div className="font-mono text-4xl font-bold tabular-nums mt-1">
            2 taps
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map((s) => (
          <Card key={s.idx} className="p-6 md:p-8 flex flex-col gap-5 min-h-[320px]">
            <div className="flex items-start justify-between">
              <div className="font-mono text-[40px] font-bold leading-none tracking-tight text-[#0a0a0a]">
                {s.idx}
              </div>
              <div className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a]" />
              </div>
            </div>
            <h3 className="text-2xl md:text-3xl font-black tracking-tight leading-[1.1]">
              {s.title}
            </h3>
            <p className="text-sm font-light text-black/60 leading-relaxed flex-1">
              {s.body}
            </p>
            <div className="pt-4 border-t border-black/[0.06] font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
              {s.detail}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
