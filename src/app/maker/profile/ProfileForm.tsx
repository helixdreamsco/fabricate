"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronUp, ChevronDown, Trash2, Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PrinterModelSearch } from "@/components/maker/PrinterModelSearch";
import { MATERIALS, type MaterialKey } from "@/lib/catalog";
import { MAX_PICKUP_LOCATIONS } from "@/lib/maker-profile";
import { cn } from "@/lib/utils";

type PrinterInput = {
  id?: string;
  displayName: string;
  printerModel: string;
  hasAMS: boolean;
  materials: MaterialKey[];
  active: boolean;
  notes: string;
};

type LocationInput = {
  id?: string;
  label: string;
  postcode: string;
  notes: string;
};

type Initial = {
  displayName: string;
  bio: string;
  freeCompletionPhoto: boolean;
  printers: PrinterInput[];
  locations: LocationInput[];
};

const EMPTY_PRINTER: PrinterInput = {
  displayName: "",
  printerModel: "",
  hasAMS: false,
  materials: [],
  active: true,
  notes: "",
};

const EMPTY_LOCATION: LocationInput = {
  label: "",
  postcode: "",
  notes: "",
};

export function ProfileForm({ initial }: { initial: Initial | null }) {
  const router = useRouter();
  const [form, setForm] = React.useState<Initial>(
    initial ?? {
      displayName: "",
      bio: "",
      freeCompletionPhoto: false,
      printers: [{ ...EMPTY_PRINTER }],
      locations: [{ ...EMPTY_LOCATION }],
    },
  );
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const updateLocation = (idx: number, patch: Partial<LocationInput>) =>
    setForm((f) => ({
      ...f,
      locations: f.locations.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));

  const addLocation = () =>
    setForm((f) =>
      f.locations.length >= MAX_PICKUP_LOCATIONS
        ? f
        : { ...f, locations: [...f.locations, { ...EMPTY_LOCATION }] },
    );

  const removeLocation = (idx: number) =>
    setForm((f) => ({
      ...f,
      locations: f.locations.filter((_, i) => i !== idx),
    }));

  const moveLocation = (idx: number, dir: -1 | 1) =>
    setForm((f) => {
      const swap = idx + dir;
      if (swap < 0 || swap >= f.locations.length) return f;
      const next = [...f.locations];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...f, locations: next };
    });

  const updatePrinter = (idx: number, patch: Partial<PrinterInput>) =>
    setForm((f) => ({
      ...f,
      printers: f.printers.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));

  const togglePrinterMaterial = (idx: number, key: MaterialKey) =>
    setForm((f) => ({
      ...f,
      printers: f.printers.map((p, i) =>
        i === idx
          ? {
              ...p,
              materials: p.materials.includes(key)
                ? p.materials.filter((m) => m !== key)
                : [...p.materials, key],
            }
          : p,
      ),
    }));

  const addPrinter = () =>
    setForm((f) => ({ ...f, printers: [...f.printers, { ...EMPTY_PRINTER }] }));

  const removePrinter = (idx: number) =>
    setForm((f) => ({
      ...f,
      printers: f.printers.filter((_, i) => i !== idx),
    }));

  const movePrinter = (idx: number, dir: -1 | 1) =>
    setForm((f) => {
      const swap = idx + dir;
      if (swap < 0 || swap >= f.printers.length) return f;
      const next = [...f.printers];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...f, printers: next };
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/maker/me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      router.push("/maker/payouts");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Field label="Display name *">
        <input
          required
          minLength={2}
          maxLength={80}
          value={form.displayName}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          className="bg-transparent w-full border-b border-black/15 pb-1.5 text-base font-light outline-none focus:border-black/50 transition-colors"
          placeholder="e.g. Highbury Print Lab"
        />
      </Field>
      <Field label="Short bio">
        <textarea
          maxLength={500}
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          className="bg-transparent w-full border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[80px]"
          placeholder="A line about your setup, lead times, what you specialise in."
        />
      </Field>
      {/* Pickup locations */}
      <div className="space-y-3 pt-3 border-t border-black/[0.08]">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/55 mb-1">
              Pickup locations
            </h2>
            <p className="text-[12px] font-light text-black/55 leading-snug max-w-md">
              Each pickup point shows up as its own pin on the map. The top
              one is your <strong>primary</strong> — it&rsquo;s the default
              for new jobs. Reviews and reputation are pooled across all
              your locations. Up to {MAX_PICKUP_LOCATIONS}.
            </p>
          </div>
        </div>

        {form.locations.map((l, idx) => (
          <div
            key={l.id ?? `new-loc-${idx}`}
            className="rounded-xl border border-black/[0.08] p-4 space-y-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                Location {idx + 1}
                {idx === 0 ? " · primary" : ""}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveLocation(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="p-1 rounded hover:bg-black/[0.04] disabled:opacity-30 transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveLocation(idx, 1)}
                  disabled={idx === form.locations.length - 1}
                  aria-label="Move down"
                  className="p-1 rounded hover:bg-black/[0.04] disabled:opacity-30 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {form.locations.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeLocation(idx)}
                    aria-label="Remove location"
                    className="p-1 rounded text-red-700 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            <Field label="Label (optional)">
              <input
                value={l.label}
                onChange={(e) => updateLocation(idx, { label: e.target.value })}
                placeholder="e.g. Home studio · UCL workshop"
                className="bg-transparent w-full border-b border-black/15 pb-1.5 text-base font-light outline-none focus:border-black/50 transition-colors"
                maxLength={60}
              />
            </Field>

            <Field label="Postcode (London) *">
              <input
                required
                value={l.postcode}
                onChange={(e) => updateLocation(idx, { postcode: e.target.value })}
                placeholder="N1 7HQ"
                className="bg-transparent w-full border-b border-black/15 pb-1.5 text-base font-light outline-none focus:border-black/50 transition-colors"
                maxLength={16}
              />
            </Field>

            <Field label="Pickup notes (optional)">
              <textarea
                value={l.notes}
                onChange={(e) => updateLocation(idx, { notes: e.target.value })}
                placeholder="Buzzer #4, weekdays after 6pm…"
                className="bg-transparent w-full border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[60px]"
                maxLength={300}
              />
            </Field>
          </div>
        ))}

        {form.locations.length < MAX_PICKUP_LOCATIONS ? (
          <button
            type="button"
            onClick={addLocation}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/65 hover:border-black/45 hover:text-black transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add another location
          </button>
        ) : (
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
            Max {MAX_PICKUP_LOCATIONS} locations.
          </p>
        )}
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.freeCompletionPhoto}
          onChange={(e) => setForm((f) => ({ ...f, freeCompletionPhoto: e.target.checked }))}
          className="w-4 h-4 mt-0.5"
        />
        <span className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] block">
            Offer completion photos free
          </span>
          <span className="block text-[12px] font-light text-black/55 mt-0.5 leading-snug">
            When a creator pays extra to require a completion photo, the fee
            is waived if they pick your bid. Surfaces as a badge on every
            bid you place, regardless of which printer takes the job.
          </span>
        </span>
      </label>

      {/* Printers */}
      <div className="space-y-3 pt-3 border-t border-black/[0.08]">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/55 mb-1">
              Your printers
            </h2>
            <p className="text-[12px] font-light text-black/55 leading-snug max-w-md">
              List every printer you&rsquo;d take jobs on. Order them — the
              top one wins auto-selection when a job can run on more than
              one of yours. Drag the arrows to reorder.
            </p>
          </div>
        </div>

        {form.printers.map((p, idx) => (
          <div
            key={p.id ?? `new-${idx}`}
            className="rounded-xl border border-black/[0.08] p-4 space-y-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
                Priority {idx + 1}
                {idx === 0 ? " · primary" : ""}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => movePrinter(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="p-1 rounded hover:bg-black/[0.04] disabled:opacity-30 transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => movePrinter(idx, 1)}
                  disabled={idx === form.printers.length - 1}
                  aria-label="Move down"
                  className="p-1 rounded hover:bg-black/[0.04] disabled:opacity-30 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {form.printers.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removePrinter(idx)}
                    aria-label="Remove printer"
                    className="p-1 rounded text-red-700 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            <Field label="Nickname">
              <input
                required
                value={p.displayName}
                onChange={(e) => updatePrinter(idx, { displayName: e.target.value })}
                placeholder="e.g. P1S workhorse"
                className="bg-transparent w-full border-b border-black/15 pb-1.5 text-base font-light outline-none focus:border-black/50 transition-colors"
                maxLength={80}
              />
            </Field>

            <Field label="Printer model">
              <PrinterModelSearch
                value={p.printerModel}
                onChange={(v) => updatePrinter(idx, { printerModel: v })}
                onAmsHint={(suggested) => {
                  if (suggested && !p.hasAMS) {
                    updatePrinter(idx, { hasAMS: true });
                  }
                }}
              />
            </Field>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={p.hasAMS}
                onChange={(e) => updatePrinter(idx, { hasAMS: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
                AMS / multi-material capable
              </span>
            </label>

            <Field label="Materials this printer stocks">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mb-2 -mt-1">
                Leave all unticked to mean &ldquo;I&rsquo;ll print any material on this printer&rdquo;.
              </p>
              <div className="flex flex-wrap gap-2">
                {MATERIALS.map((m) => {
                  const on = p.materials.includes(m.key);
                  return (
                    <button
                      type="button"
                      key={m.key}
                      onClick={() => togglePrinterMaterial(idx, m.key)}
                      className={cn(
                        "px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-[0.16em] border transition-colors",
                        on
                          ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                          : "bg-white text-black/65 border-black/15 hover:border-black/40",
                      )}
                      aria-pressed={on}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) => updatePrinter(idx, { active: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
                Active — accepting jobs
              </span>
            </label>

            {p.id ? (
              <div className="pt-2 border-t border-black/[0.06]">
                <Link
                  href={`/maker/printers/${p.id}`}
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-black/65 hover:text-black underline underline-offset-4"
                >
                  Manage filament inventory <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/35 pt-2 border-t border-black/[0.06]">
                Save first to manage filament inventory for this printer.
              </p>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addPrinter}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/65 hover:border-black/45 hover:text-black transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add another printer
        </button>
      </div>

      {err ? <div className="text-sm text-red-600 font-light">{err}</div> : null}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" withArrow disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Continue"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 block mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
