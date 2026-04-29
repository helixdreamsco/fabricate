"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { MiniViewer } from "@/components/configure/MiniViewer";
import { TestModeBadge } from "@/components/jobs/TestModeBadge";
import { MATERIALS, QUALITIES } from "@/lib/catalog";
import { estimateQuote } from "@/lib/pricing";
import { formatGBP, formatDuration, cn } from "@/lib/utils";
import { useOrder } from "@/lib/order-store";
import {
  poundsToPence,
  COMPLETION_PHOTO_FEE_PENCE,
  TEST_STRIP_PRICE_PENCE,
} from "@/lib/money";
import type { MakerProfileSummary } from "@/lib/maker-profile";

/**
 * Post-job flow.
 *
 * Replaces the demo's mock-Stripe checkout. No payment is captured at this
 * step — the job is posted to the open market, payment authorisation
 * happens when the creator accepts a maker's bid. (See payments.ts.)
 *
 * Wiring:
 *   1. Reads the in-memory OrderDraft.
 *   2. POSTs the file to /api/uploads.
 *   3. POSTs the job manifest to /api/jobs.
 *   4. Redirects to /jobs/<id>.
 */
export function CheckoutForm({
  signedIn,
  prefillName,
}: {
  signedIn: boolean;
  prefillEmail: string;
  prefillName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const { draft } = useOrder();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [pickupNotes, setPickupNotes] = React.useState("");
  const [notes, setNotes] = React.useState(draft.notes ?? "");
  const [prioritizedMakerId, setPrioritizedMakerId] = React.useState<string | null>(null);
  const [makers, setMakers] = React.useState<MakerProfileSummary[]>([]);
  // Editable price — defaults to the auto-computed quote for known formats
  // and is required for STEP files (where we have no volume to estimate from).
  const [pricePounds, setPricePounds] = React.useState("");
  // Optional add-on: maker must upload a photo of the finished print before
  // it can be marked ready for pickup. Goes to the maker as a payout bonus.
  const [requirePhoto, setRequirePhoto] = React.useState(false);
  // Verification test strip — small printed stencil with the order's HD-XXXXXX
  // code engraved. Default ON; creator pays the maker for filament+time.
  const [includeTestStrip, setIncludeTestStrip] = React.useState(true);

  React.useEffect(() => {
    if (!draft.analysis || !draft.file) {
      router.replace("/");
    }
  }, [draft.analysis, draft.file, router]);

  React.useEffect(() => {
    void fetch("/api/makers").then((r) => r.ok ? r.json() : { makers: [] }).then((j) => {
      setMakers(j.makers ?? []);
    });
  }, []);

  if (!draft.analysis || !draft.file) return null;

  const isStep = draft.analysis.format === "step";

  const quote = estimateQuote({
    volumeCm3: draft.analysis.volumeCm3,
    material: draft.material,
    quality: draft.quality,
    infillPct: draft.infill,
    quantity: draft.quantity,
    delivery: "pickup",
  });

  // Seed the editable price field from the auto-quote on first render. STEP
  // files start blank (no auto-estimate possible) — creator must type a
  // value before submit is enabled.
  React.useEffect(() => {
    if (pricePounds === "" && !isStep && quote.total > 0) {
      setPricePounds(quote.total.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.total, isStep]);

  const parsedPrice = parseFloat(pricePounds);
  // Auto-estimate is the floor for STL/3MF inputs. STEP files don't get an
  // estimate so the user-entered price is the floor (must be > 0).
  const minPrice = isStep ? 0 : quote.total;
  const validPrice =
    Number.isFinite(parsedPrice) &&
    parsedPrice > 0 &&
    (isStep || parsedPrice >= minPrice);
  const effectivePrice = validPrice ? parsedPrice : quote.total;

  const material = MATERIALS.find((m) => m.key === draft.material)!;
  const quality = QUALITIES.find((q) => q.key === draft.quality)!;

  const onPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.file || !draft.analysis) return;
    if (!validPrice) {
      setError(
        isStep
          ? "Set a price before posting."
          : `Price must be at least £${minPrice.toFixed(2)} (auto-estimated minimum).`,
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", draft.file);
      const upRes = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!upRes.ok) {
        const j = await upRes.json().catch(() => ({}));
        throw new Error(j.error ?? `upload failed (${upRes.status})`);
      }
      const up = await upRes.json();

      const payload = {
        fileName: draft.analysis.fileName ?? draft.file.name,
        fileUrl: up.fileUrl,
        fileSizeBytes: up.fileSizeBytes ?? draft.file.size,
        material: draft.material,
        partColors: draft.partColors,
        quality: draft.quality,
        infillPct: draft.infill,
        quantity: draft.quantity,
        isMultiMaterial: draft.analysis.isMultiMaterial ?? false,
        partsCount: draft.analysis.parts.length,
        estimatedGrams: draft.serverQuote?.quote.weight_g ?? null,
        estimatedMinutes: draft.serverQuote?.quote.time_minutes
          ? Math.round(draft.serverQuote.quote.time_minutes)
          : null,
        notes: notes || null,
        quotedPricePence: poundsToPence(effectivePrice),
        minPricePence: poundsToPence(minPrice),
        // Pickup location defaults to the assigned maker's postcode; creator
        // can add a free-text note here suggesting an alternate meet-up.
        pickupPostcode: null,
        pickupLat: null,
        pickupLng: null,
        pickupNotes: pickupNotes || null,
        prioritizedMakerId: prioritizedMakerId,
        communityId: draft.community?.id ?? null,
        requireCompletionPhoto: requirePhoto,
        testStripPaid: includeTestStrip,
      };

      const jobRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!jobRes.ok) {
        const j = await jobRes.json().catch(() => ({}));
        throw new Error(j.error ?? `post failed (${jobRes.status})`);
      }
      const { job } = await jobRes.json();
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-grid-none">
      {/* Breadcrumb */}
      <div className="border-b border-black/[0.06] bg-white">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 h-10 flex items-center justify-between">
          <Link
            href="/configure"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/55 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Configure
          </Link>
          <div className="flex items-center gap-4">
            <Crumb idx="01" label="Upload" done />
            <Divider />
            <Crumb idx="02" label="Configure" done />
            <Divider />
            <Crumb idx="03" label="Post job" active />
            <Divider />
            <Crumb idx="04" label="Track" />
          </div>
          <div className="w-14" />
        </div>
      </div>

      <div className="flex-1 max-w-[1400px] w-full mx-auto px-5 md:px-8 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] gap-8 lg:gap-14">
          {/* Summary */}
          <section>
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <MonoLabel size="md">
                Job summary · {draft.analysis.fileName}
              </MonoLabel>
              <TestModeBadge />
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05] mb-6">
              Post to the open market.
              <br />
              <span className="text-black/45">No charge until you pick a bid.</span>
            </h1>

            <div className="rounded-2xl border border-black/[0.08] overflow-hidden bg-white">
              <div className="aspect-[16/10] w-full border-b border-black/[0.06] bg-white relative">
                <MiniViewer
                  parts={draft.analysis.parts.map((p, i) => ({
                    id: p.geometry.uuid,
                    geometry: p.geometry,
                    color: draft.partColors[i] ?? draft.partColors[0] ?? "#0a0a0a",
                  }))}
                  className="absolute inset-0"
                />
                <div className="absolute top-4 left-4 font-mono text-[9px] uppercase tracking-[0.2em] text-black/45">
                  Preview
                </div>
                <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap">
                  {isStep ? (
                    <>
                      <MiniTag label="STEP file" />
                      <MiniTag label="Preview not available" />
                    </>
                  ) : (
                    <>
                      <MiniTag label={`${draft.analysis.volumeCm3.toFixed(1)} cm³`} />
                      <MiniTag
                        label={`${draft.analysis.dimsMm.x.toFixed(0)}×${draft.analysis.dimsMm.y.toFixed(
                          0,
                        )}×${draft.analysis.dimsMm.z.toFixed(0)} mm`}
                      />
                    </>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-black/[0.06]">
                <Spec label="Material" value={material.label} />
                <Spec
                  label={draft.analysis.isMultiMaterial ? `Colours · ${draft.analysis.parts.length}` : "Colour"}
                  value={
                    draft.analysis.isMultiMaterial
                      ? `${draft.partColors.length} parts`
                      : material.colors.find((c) => c.hex === draft.partColors[0])?.name ?? "—"
                  }
                />
                <Spec label="Quality" value={quality.label} />
                <Spec label="Infill" value={`${draft.infill}%`} />
                <Spec label="Quantity" value={String(draft.quantity)} />
                <Spec label="Estimated time" value={formatDuration((draft.serverQuote?.quote.time_minutes ?? 0) / 60)} />
              </dl>

              <div className="border-t border-black/[0.06] px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <MonoLabel size="sm">Your quoted price (£)</MonoLabel>
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mt-1">
                    {isStep
                      ? "STEP files don't auto-estimate. Pick a fair price; makers can counter-bid."
                      : `Auto-estimated minimum £${minPrice.toFixed(2)}. You can post higher.`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-2xl font-black text-black/45 tabular-nums">£</span>
                  <input
                    type="number"
                    min={isStep ? 0.5 : minPrice}
                    step={0.5}
                    inputMode="decimal"
                    required
                    value={pricePounds}
                    onChange={(e) => setPricePounds(e.target.value)}
                    placeholder={isStep ? "0.00" : ""}
                    className="w-28 text-right text-2xl font-black tabular-nums bg-transparent border-b-2 border-black/15 outline-none focus:border-black/60 transition-colors"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Form */}
          <aside>
            <Card className="p-5 md:p-6">
              <form onSubmit={onPost} className="space-y-5">
                <div className="rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 py-2.5">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/55 mb-1">
                    Pickup
                  </div>
                  <p className="text-sm font-light text-black/65 leading-relaxed">
                    You collect the print from the maker. Once you accept a
                    bid you&rsquo;ll see their address and can chat to agree
                    a time — or somewhere else to meet.
                  </p>
                </div>

                <div>
                  <Label>Suggest a meet-up (optional)</Label>
                  <input
                    value={pickupNotes}
                    onChange={(e) => setPickupNotes(e.target.value)}
                    placeholder="e.g. ‘Happy to meet near London Bridge’"
                    className="bg-transparent w-full border-b border-black/15 pb-1.5 text-base font-light outline-none focus:border-black/50 transition-colors"
                  />
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mt-1.5">
                    Just a hint for makers. Final location is agreed in chat.
                  </p>
                </div>

                <div>
                  <Label>Anything for the maker (optional)</Label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. ‘matte preferred’, ‘deadline Friday’, ‘tolerance critical at the hinge’."
                    className="w-full bg-transparent border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[72px]"
                    maxLength={2000}
                  />
                </div>

                <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-black/[0.08] px-3 py-3 hover:border-black/25 transition-colors">
                  <input
                    type="checkbox"
                    checked={requirePhoto}
                    onChange={(e) => setRequirePhoto(e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span className="block flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
                        Require completion photo
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 tabular-nums">
                        +{formatGBP(COMPLETION_PHOTO_FEE_PENCE / 100)}
                      </span>
                    </span>
                    <span className="block text-[12px] font-light text-black/55 mt-1 leading-snug">
                      Maker uploads a photo of the finished print. You see it
                      before going to collect. Fee passes to the maker — some
                      offer it free.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-black/[0.08] px-3 py-3 hover:border-black/25 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeTestStrip}
                    onChange={(e) => setIncludeTestStrip(e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span className="block flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
                        Include test strip
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 tabular-nums">
                        +{formatGBP(TEST_STRIP_PRICE_PENCE / 100)}
                      </span>
                    </span>
                    <span className="block text-[12px] font-light text-black/55 mt-1 leading-snug">
                      Maker prints a small stencil with your order&rsquo;s
                      unique code, photographed next to the finished part as
                      proof their printer is working. Recommended for
                      first-time orders.
                    </span>
                  </span>
                </label>

                <div>
                  <Label>Prioritize a maker (optional)</Label>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mb-2">
                    Job goes to everyone — your pick gets a star. Makers in
                    your communities surface first.
                  </p>
                  {(() => {
                    const community = makers.filter((m) => m.sharedCommunities.length > 0);
                    const others = makers.filter((m) => m.sharedCommunities.length === 0);
                    const renderOption = (m: MakerProfileSummary) => {
                      const meta = [
                        m.printerModel,
                        m.postcode,
                        m.sharedCommunities[0]?.name,
                      ].filter(Boolean).join(" · ");
                      return (
                        <option key={m.id} value={m.id}>
                          {m.displayName}{meta ? ` · ${meta}` : ""}
                        </option>
                      );
                    };
                    return (
                      <select
                        value={prioritizedMakerId ?? ""}
                        onChange={(e) => setPrioritizedMakerId(e.target.value || null)}
                        className="w-full bg-transparent border border-black/15 rounded-lg px-3 py-2 text-sm font-light outline-none focus:border-black/50 transition-colors"
                      >
                        <option value="">— No preference —</option>
                        {community.length > 0 ? (
                          <optgroup label="From your communities">
                            {community.map(renderOption)}
                          </optgroup>
                        ) : null}
                        {others.length > 0 ? (
                          community.length > 0 ? (
                            <optgroup label="Other makers">
                              {others.map(renderOption)}
                            </optgroup>
                          ) : (
                            others.map(renderOption)
                          )
                        ) : null}
                      </select>
                    );
                  })()}
                  {prioritizedMakerId ? (() => {
                    const m = makers.find((x) => x.id === prioritizedMakerId);
                    return (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.18em] text-[9px] bg-amber-500/15 text-amber-800 border border-amber-500/30">
                          <Star className="w-2.5 h-2.5" strokeWidth={2.5} /> Prioritized
                        </span>
                        {m?.sharedCommunities.slice(0, 2).map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.18em] text-[9px] border"
                            style={{
                              background: `hsl(${c.iconHue} 70% 96%)`,
                              borderColor: `hsl(${c.iconHue} 50% 80%)`,
                              color: `hsl(${c.iconHue} 60% 30%)`,
                            }}
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    );
                  })() : null}
                </div>

                {error ? (
                  <div className="text-sm text-red-600 font-light">{error}</div>
                ) : null}

                <Button
                  type="submit"
                  size="xl"
                  withArrow
                  disabled={pending || !validPrice}
                  className="w-full"
                >
                  {pending
                    ? "Posting…"
                    : !validPrice
                      ? "Set a price"
                      : `Post job · ${formatGBP(effectivePrice)}`}
                </Button>

                <div className="flex items-start gap-2 text-xs font-light text-black/55 leading-relaxed">
                  <ShieldCheck className="w-3.5 h-3.5 text-black/40 shrink-0 mt-0.5" strokeWidth={2.2} />
                  <span>
                    No charge yet. Your card is taken when you accept a bid; held
                    by Fabricate until pickup is verified, then released to the
                    maker.{signedIn ? "" : " Sign in to post."}
                  </span>
                </div>
                {prefillName ? (
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
                    Posting as {prefillName}
                  </div>
                ) : null}
              </form>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 block mb-1.5">
      {children}
    </span>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mb-1">
        {label}
      </dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function MiniTag({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-white border border-black/[0.08] font-mono text-[9px] uppercase tracking-[0.18em] text-black/55">
      {label}
    </span>
  );
}

function Crumb({
  idx, label, done, active,
}: {
  idx: string; label: string; done?: boolean; active?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]",
        active ? "text-black" : done ? "text-black/55" : "text-black/30"
      )}
    >
      <span className={cn("w-4 h-4 rounded-full inline-flex items-center justify-center text-[8px]",
        active ? "bg-[#0a0a0a] text-white" :
        done ? "bg-black/[0.08] text-black/65" :
        "bg-black/[0.04] text-black/35")}
      >
        {idx}
      </span>
      {label}
    </div>
  );
}

function Divider() {
  return <span className="text-black/15">—</span>;
}
