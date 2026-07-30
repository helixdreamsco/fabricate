"use client";
import * as React from "react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Stepper } from "@/components/ui/Stepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  QUANTITY_TIERS,
  quantityTierDiscountPct,
  nextQuantityTier,
} from "@/lib/catalog";
import type { TemplateSpec } from "@/lib/design/schema";

/**
 * Run-size picker for templates that declare a `quantity` block. Renders as
 * fixed set sizes when the template lists presets (a coaster set is 4/6/12,
 * not 7), otherwise a stepper.
 *
 * Templates without a quantity block never render this — quantity is 1 and
 * the whole control stays hidden.
 */
export function QuantityPicker({
  spec,
  value,
  onChange,
}: {
  spec: TemplateSpec;
  value: number;
  onChange: (n: number) => void;
}) {
  const q = spec.quantity;
  if (!q) return null;

  const earnedPct = quantityTierDiscountPct(value);
  const next = nextQuantityTier(value);

  return (
    <section className="mt-6 border-t border-black/[0.06] pt-5">
      <div className="flex items-center justify-between gap-3">
        <MonoLabel size="md">{q.presets ? "Set size" : "Quantity"}</MonoLabel>
        {q.presets ? (
          <SegmentedControl
            value={String(value)}
            options={q.presets.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => onChange(Number(v))}
          />
        ) : (
          <Stepper value={value} onChange={onChange} min={q.min} max={q.max} />
        )}
      </div>

      {/* Tier badges — the earned one is filled, the rest sit as targets. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {QUANTITY_TIERS.filter((t) => t.minQty <= q.max).map((tier) => {
          const earned = value >= tier.minQty;
          return (
            <span
              key={tier.minQty}
              className={
                earned
                  ? "inline-flex items-center rounded-full border border-[#10b981]/25 bg-[#10b981]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#047857]"
                  : "inline-flex items-center rounded-full border border-black/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-black/35"
              }
            >
              {tier.label}
            </span>
          );
        })}
      </div>

      {next && next.minQty <= q.max ? (
        <MonoLabel size="xs" className="mt-2 block">
          {next.minQty - value} more for {next.discountPct}% off
        </MonoLabel>
      ) : earnedPct > 0 ? (
        <MonoLabel size="xs" className="mt-2 block">
          Volume break applied · {earnedPct}% off the printing subtotal
        </MonoLabel>
      ) : null}

      {value >= q.max ? (
        <MonoLabel size="xs" className="mt-2 block">
          {q.max} is our largest single run — for bigger orders, get in touch
          and we&apos;ll split it across makers.
        </MonoLabel>
      ) : null}
    </section>
  );
}
