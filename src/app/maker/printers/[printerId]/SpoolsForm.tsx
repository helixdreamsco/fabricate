"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Spool } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { cn } from "@/lib/utils";

export type SpoolInput = {
  id?: string;
  material: string;
  brand: string;
  colorName: string;
  colorHex: string;
  status: "IN_STOCK" | "LOW" | "EMPTY";
  notes: string;
};

const EMPTY_SPOOL: SpoolInput = {
  material: "PLA",
  brand: "",
  colorName: "",
  colorHex: "#7C3AED",
  status: "IN_STOCK",
  notes: "",
};

const MATERIAL_OPTIONS = [
  "PLA",
  "PETG",
  "ABS",
  "TPU",
  "ASA",
  "PC",
  "PA",
  "NYLON",
  "OTHER",
];

const BRAND_SUGGESTIONS = [
  "Bambu Lab Basic",
  "Bambu Lab Matte",
  "Bambu Lab Silk",
  "Polymaker PolyTerra",
  "Polymaker PolyLite",
  "Polymaker PolyMax",
  "Prusament",
  "eSun",
  "Sunlu",
  "Overture",
  "Hatchbox",
  "Fillamentum",
  "ColorFabb",
  "Protopasta",
];

const STATUS_OPTIONS: { key: SpoolInput["status"]; label: string }[] = [
  { key: "IN_STOCK", label: "In stock" },
  { key: "LOW", label: "Low" },
  { key: "EMPTY", label: "Empty" },
];

export function SpoolsForm({
  printerId,
  initial,
}: {
  printerId: string;
  initial: SpoolInput[];
}) {
  const router = useRouter();
  const [spools, setSpools] = React.useState<SpoolInput[]>(initial);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const update = (idx: number, patch: Partial<SpoolInput>) =>
    setSpools((s) => s.map((sp, i) => (i === idx ? { ...sp, ...patch } : sp)));

  const remove = (idx: number) =>
    setSpools((s) => s.filter((_, i) => i !== idx));

  const add = () => setSpools((s) => [...s, { ...EMPTY_SPOOL }]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/maker/printers/${printerId}/spools`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spools }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2 text-black/65">
            <Spool className="w-3.5 h-3.5" strokeWidth={2.2} />
            <MonoLabel size="sm" className="!text-black/65">
              Filament inventory
            </MonoLabel>
          </div>
          <span className="text-[12px] font-light text-black/55">
            {spools.length === 0
              ? "No spools added yet"
              : `${spools.length} spool${spools.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {spools.length === 0 ? (
          <p className="text-sm font-light text-black/55 mb-4 leading-relaxed">
            Add the filament rolls you have loaded or available for this
            printer. Creators with colour-matters jobs will only see your bid
            when you have a matching spool — accuracy here means more
            relevant work.
          </p>
        ) : null}

        <ul className="flex flex-col gap-3 mb-4">
          {spools.map((s, idx) => (
            <li
              key={s.id ?? `new-${idx}`}
              className={cn(
                "rounded-xl border p-4",
                s.status === "EMPTY"
                  ? "border-black/[0.06] bg-black/[0.02] opacity-70"
                  : "border-black/[0.10] bg-white",
              )}
            >
              <div className="grid grid-cols-1 md:grid-cols-[80px_1fr_auto] gap-4 items-start">
                {/* Swatch + hex picker */}
                <div className="flex flex-col items-center gap-1.5">
                  <label className="relative w-16 h-16 rounded-lg border border-black/[0.10] overflow-hidden cursor-pointer shadow-sm hover:shadow transition-shadow">
                    <span
                      className="absolute inset-0"
                      style={{ background: s.colorHex }}
                    />
                    <input
                      type="color"
                      value={s.colorHex}
                      onChange={(e) =>
                        update(idx, { colorHex: e.target.value.toUpperCase() })
                      }
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      aria-label="Pick spool colour"
                    />
                  </label>
                  <span className="font-mono text-[9px] tracking-[0.08em] text-black/45">
                    {s.colorHex}
                  </span>
                </div>

                {/* Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Material">
                    <select
                      value={s.material}
                      onChange={(e) => update(idx, { material: e.target.value })}
                      className="bg-transparent w-full border-b border-black/15 pb-1.5 text-sm font-light outline-none focus:border-black/50 transition-colors"
                    >
                      {MATERIAL_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <div className="flex gap-1">
                      {STATUS_OPTIONS.map((opt) => {
                        const on = s.status === opt.key;
                        return (
                          <button
                            type="button"
                            key={opt.key}
                            onClick={() => update(idx, { status: opt.key })}
                            className={cn(
                              "px-2.5 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.14em] border transition-colors",
                              on
                                ? opt.key === "EMPTY"
                                  ? "bg-black/55 text-white border-black/55"
                                  : opt.key === "LOW"
                                  ? "bg-amber-500 text-white border-amber-500"
                                  : "bg-[#7c3aed] text-white border-[#7c3aed]"
                                : "bg-white text-black/55 border-black/15 hover:border-black/40",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Colour name">
                    <input
                      required
                      value={s.colorName}
                      onChange={(e) => update(idx, { colorName: e.target.value })}
                      placeholder="e.g. Forest Green, Matte Black"
                      maxLength={60}
                      className="bg-transparent w-full border-b border-black/15 pb-1.5 text-sm font-light outline-none focus:border-black/50 transition-colors"
                    />
                  </Field>
                  <Field label="Brand">
                    <input
                      value={s.brand}
                      onChange={(e) => update(idx, { brand: e.target.value })}
                      placeholder="e.g. Bambu Lab Basic"
                      list={`brand-list-${idx}`}
                      maxLength={80}
                      className="bg-transparent w-full border-b border-black/15 pb-1.5 text-sm font-light outline-none focus:border-black/50 transition-colors"
                    />
                    <datalist id={`brand-list-${idx}`}>
                      {BRAND_SUGGESTIONS.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </Field>
                  <div className="col-span-2">
                    <Field label="Notes (optional)">
                      <input
                        value={s.notes}
                        onChange={(e) => update(idx, { notes: e.target.value })}
                        placeholder="e.g. ~600g remaining, opened Mar 2026"
                        maxLength={500}
                        className="bg-transparent w-full border-b border-black/15 pb-1.5 text-sm font-light outline-none focus:border-black/50 transition-colors"
                      />
                    </Field>
                  </div>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  aria-label="Remove spool"
                  className="p-1.5 rounded text-red-700 hover:bg-red-500/10 transition-colors self-start"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/65 hover:border-black/45 hover:text-black transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add a spool
        </button>

        {err ? (
          <div className="mt-4 text-sm text-red-600 font-light">{err}</div>
        ) : null}

        <div className="mt-5 pt-4 border-t border-black/[0.06] flex items-center gap-3">
          <Button type="submit" size="md" withArrow disabled={saving}>
            {saving ? "Saving…" : "Save inventory"}
          </Button>
          {savedAt ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
              Saved
            </span>
          ) : null}
        </div>
      </Card>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 block mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
