"use client";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { ParamSpec, ParamValues, TemplateSpec } from "@/lib/design/schema";
import { ICON_IDS, logoAreaMm } from "@/lib/design/schema";
import { AssetControl } from "./AssetControl";

const FONT_LABELS: Record<string, string> = {
  "sans-bold": "Sans",
  "serif-bold": "Serif",
  "mono-bold": "Mono",
};

/**
 * Constraint-clamped controls generated from the template spec — invalid
 * states are unreachable (text filtered to the allowed set, numbers on the
 * spec's step grid, enums/icons as pickers).
 */
export function ParamControls({
  spec,
  values,
  onChange,
}: {
  spec: TemplateSpec;
  values: ParamValues;
  onChange: (key: string, value: string | number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {Object.entries(spec.params).map(([key, param]) => (
        <Control
          key={key}
          param={param}
          value={values[key]}
          onChange={(v) => onChange(key, v)}
          // Logo printability depends on how big the logo actually prints,
          // which depends on the part's current size.
          logoAreaMm={
            param.kind === "asset" ? logoAreaMm(spec, values, key) : undefined
          }
        />
      ))}
    </div>
  );
}

function Control({
  param,
  value,
  onChange,
  logoAreaMm: areaMm,
}: {
  param: ParamSpec;
  value: string | number;
  onChange: (v: string | number) => void;
  logoAreaMm?: number;
}) {
  switch (param.kind) {
    case "text": {
      const allowed = new RegExp(param.pattern);
      return (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <MonoLabel size="sm">{param.label}</MonoLabel>
            <MonoLabel size="xs">
              {String(value).length}/{param.maxLength}
            </MonoLabel>
          </div>
          <Input
            type="text"
            value={String(value)}
            maxLength={param.maxLength}
            placeholder={param.minLength > 0 ? "Required" : "Optional"}
            onChange={(e) => {
              const raw = e.target.value.slice(0, param.maxLength);
              onChange(raw.split("").filter((ch) => allowed.test(ch)).join(""));
            }}
          />
        </div>
      );
    }
    case "number":
      return (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <MonoLabel size="sm">{param.label}</MonoLabel>
            <span className="font-mono text-[11px] tabular-nums text-black">
              {value}
              <span className="text-black/40">{param.unit ?? ""}</span>
            </span>
          </div>
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={param.step}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[#0a0a0a]"
          />
        </div>
      );
    case "enum":
    case "part":
      return (
        <div>
          <MonoLabel size="sm" className="mb-1.5 block">
            {param.label}
          </MonoLabel>
          <SegmentedControl
            value={String(value)}
            options={param.options.map((opt) => ({
              value: opt,
              label: FONT_LABELS[opt] ?? opt,
            }))}
            onChange={onChange}
          />
        </div>
      );
    case "icon":
      return (
        <div>
          <MonoLabel size="sm" className="mb-1.5 block">
            {param.label}
          </MonoLabel>
          <div className="grid grid-cols-6 gap-2">
            {ICON_IDS.map((icon) => (
              <button
                key={icon}
                type="button"
                title={icon}
                onClick={() => onChange(icon)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-lg border p-1.5 transition-colors",
                  value === icon
                    ? "border-[#0a0a0a] bg-black/[0.04]"
                    : "border-black/10 bg-white hover:border-black/30",
                )}
              >
                <Image
                  src={`/design-icons/${icon}.svg`}
                  alt={icon}
                  width={24}
                  height={24}
                  className="h-full w-full"
                  unoptimized
                />
              </button>
            ))}
          </div>
        </div>
      );

    case "asset":
      return (
        <AssetControl
          label={param.label}
          value={String(value ?? "")}
          targetMm={areaMm ?? 30}
          onChange={onChange}
        />
      );
  }
}
