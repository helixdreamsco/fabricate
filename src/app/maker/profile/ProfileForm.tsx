"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PrinterModelSearch } from "@/components/maker/PrinterModelSearch";
import { MATERIALS, type MaterialKey } from "@/lib/catalog";
import { cn } from "@/lib/utils";

type Initial = {
  displayName: string;
  bio: string;
  postcode: string;
  hasAMS: boolean;
  printerModel: string;
  materials: MaterialKey[];
  freeCompletionPhoto: boolean;
};

export function ProfileForm({ initial }: { initial: Initial | null }) {
  const router = useRouter();
  const [form, setForm] = React.useState<Initial>(
    initial ?? {
      displayName: "",
      bio: "",
      postcode: "",
      hasAMS: false,
      printerModel: "",
      materials: [],
      freeCompletionPhoto: false,
    }
  );
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function toggleMaterial(key: MaterialKey) {
    setForm((f) => ({
      ...f,
      materials: f.materials.includes(key)
        ? f.materials.filter((m) => m !== key)
        : [...f.materials, key],
    }));
  }

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
          placeholder="A line about your printer setup, lead times, what you specialise in."
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Postcode (London)">
          <input
            value={form.postcode}
            onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
            className="bg-transparent w-full border-b border-black/15 pb-1.5 text-base font-light outline-none focus:border-black/50 transition-colors"
            placeholder="N1 7HQ"
            maxLength={16}
          />
        </Field>
        <Field label="Printer model">
          <PrinterModelSearch
            value={form.printerModel}
            onChange={(v) => setForm((f) => ({ ...f, printerModel: v }))}
            onAmsHint={(suggested) => {
              if (suggested && !form.hasAMS) {
                setForm((f) => ({ ...f, hasAMS: true }));
              }
            }}
          />
        </Field>
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.hasAMS}
          onChange={(e) => setForm((f) => ({ ...f, hasAMS: e.target.checked }))}
          className="w-4 h-4"
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
          AMS / multi-material capable
        </span>
      </label>

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
            When a creator pays extra to require a completion photo (£2),
            the fee is waived if they pick your bid. Surfaces as a badge on
            your bids.
          </span>
        </span>
      </label>

      <Field label="Materials I stock">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mb-2 -mt-1">
          We use this to surface jobs you can actually fulfil first.
        </p>
        <div className="flex flex-wrap gap-2">
          {MATERIALS.map((m) => {
            const on = form.materials.includes(m.key);
            return (
              <button
                type="button"
                key={m.key}
                onClick={() => toggleMaterial(m.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-[0.16em] border transition-colors",
                  on
                    ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                    : "bg-white text-black/65 border-black/15 hover:border-black/40"
                )}
                aria-pressed={on}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </Field>

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
