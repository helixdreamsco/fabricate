"use client";
import * as React from "react";
import type { MakerSubscription } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-black/[0.10] bg-white text-sm font-light placeholder:text-black/35 focus:border-black/40 focus:outline-none";
const labelCls =
  "block font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1";

const STRICTNESS_OPTS = [
  { value: "strict", label: "Strict", detail: "Only match my printer's primary stocked material to the job's primary." },
  { value: "primary_or_alt", label: "Reasonable", detail: "Match if I stock the primary OR any alternative the creator listed." },
  { value: "firehose", label: "Firehose", detail: "Every job, even when I don't stock the right material." },
] as const;

const STRATEGY_OPTS = [
  { value: "match_listed", label: "Match listed price", detail: "Bid exactly the creator's listed quote — safest." },
  { value: "undercut_pct", label: "Undercut by %", detail: "Bid a percentage below the listed price." },
  { value: "fixed_offset", label: "Undercut by £", detail: "Bid a fixed amount below the listed price." },
] as const;

export function AlertsForm({ initial }: { initial: MakerSubscription }) {
  const [s, setS] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const upd = <K extends keyof MakerSubscription>(
    k: K,
    v: MakerSubscription[K],
  ) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setSavedAt(null);
  };

  const onSave = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/maker/subscription", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alertsEnabled: s.alertsEnabled,
          alertsEmailEnabled: s.alertsEmailEnabled,
          alertsRadiusKm: s.alertsRadiusKm,
          alertsGlobal: s.alertsGlobal,
          alertsStrictness: s.alertsStrictness,
          alertsQuietStart: s.alertsQuietStart || null,
          alertsQuietEnd: s.alertsQuietEnd || null,
          autoBidEnabled: s.autoBidEnabled,
          autoBidUseAlertsCoverage: s.autoBidUseAlertsCoverage,
          autoBidRadiusKm: s.autoBidRadiusKm,
          autoBidGlobal: s.autoBidGlobal,
          autoBidStrictness: s.autoBidStrictness,
          autoBidStrategy: s.autoBidStrategy,
          autoBidUndercutPct: s.autoBidUndercutPct,
          autoBidFixedOffsetPence: s.autoBidFixedOffsetPence,
          autoBidMakerFloorPence: s.autoBidMakerFloorPence,
          autoBidEtaHours: s.autoBidEtaHours,
          autoBidMessage: s.autoBidMessage || null,
          autoBidBadgeVisible: s.autoBidBadgeVisible,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `save failed (${r.status})`);
      }
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="divide-y divide-black/[0.06]">
      {/* Alerts */}
      <Section
        title="Job alerts"
        toggleLabel="Alert me about new jobs"
        toggleOn={s.alertsEnabled}
        onToggle={(v) => upd("alertsEnabled", v)}
        body="When a new job lands in the open market that matches your criteria, push an in-app notification (and optionally an email) so you can bid before others."
      >
        <Row label="Channel">
          <SegRadio
            value={s.alertsEmailEnabled ? "both" : "inapp"}
            onChange={(v) => upd("alertsEmailEnabled", v === "both")}
            options={[
              { value: "inapp", label: "In-app only" },
              { value: "both", label: "In-app + email" },
            ]}
            disabled={!s.alertsEnabled}
          />
        </Row>

        <Row label="Coverage">
          <CoverageControls
            global={s.alertsGlobal}
            radiusKm={s.alertsRadiusKm}
            disabled={!s.alertsEnabled}
            onGlobal={(v) => upd("alertsGlobal", v)}
            onRadius={(v) => upd("alertsRadiusKm", v)}
          />
        </Row>

        <Row label="Match strictness">
          <RadioStack
            value={s.alertsStrictness}
            onChange={(v) => upd("alertsStrictness", v)}
            options={STRICTNESS_OPTS}
            disabled={!s.alertsEnabled}
          />
        </Row>

        <Row label="Quiet hours · UTC">
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={s.alertsQuietStart ?? ""}
              onChange={(e) => upd("alertsQuietStart", e.target.value || null)}
              className={cn(inputCls, "max-w-[140px]")}
              disabled={!s.alertsEnabled}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/45">to</span>
            <input
              type="time"
              value={s.alertsQuietEnd ?? ""}
              onChange={(e) => upd("alertsQuietEnd", e.target.value || null)}
              className={cn(inputCls, "max-w-[140px]")}
              disabled={!s.alertsEnabled}
            />
            <span className="text-[12px] font-light text-black/55 ml-2">
              Email skipped during this window — in-app still fires.
            </span>
          </div>
        </Row>
      </Section>

      {/* Auto-bid */}
      <Section
        title="Auto-bid"
        toggleLabel="Place bids for me automatically"
        toggleOn={s.autoBidEnabled}
        onToggle={(v) => upd("autoBidEnabled", v)}
        body="Every match within your coverage gets an automatic bid using the strategy below. Bids that would land below the platform's floor or yours are skipped — never below your guard rails."
        warningWhenOn="Auto-bid moves real money. Test with a small radius first."
      >
        <Row label="Coverage">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[12px] font-light text-black/70 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={s.autoBidUseAlertsCoverage}
                onChange={(e) => upd("autoBidUseAlertsCoverage", e.target.checked)}
                disabled={!s.autoBidEnabled}
                className="w-4 h-4"
              />
              Use the same coverage as alerts
            </label>
            {!s.autoBidUseAlertsCoverage ? (
              <CoverageControls
                global={s.autoBidGlobal}
                radiusKm={s.autoBidRadiusKm}
                disabled={!s.autoBidEnabled}
                onGlobal={(v) => upd("autoBidGlobal", v)}
                onRadius={(v) => upd("autoBidRadiusKm", v)}
              />
            ) : null}
          </div>
        </Row>

        <Row label="Material strictness">
          <RadioStack
            value={s.autoBidStrictness}
            onChange={(v) => upd("autoBidStrictness", v)}
            options={STRICTNESS_OPTS}
            disabled={!s.autoBidEnabled}
          />
        </Row>

        <Row label="Bid strategy">
          <RadioStack
            value={s.autoBidStrategy}
            onChange={(v) => upd("autoBidStrategy", v)}
            options={STRATEGY_OPTS}
            disabled={!s.autoBidEnabled}
          />
        </Row>

        {s.autoBidStrategy === "undercut_pct" ? (
          <Row label="Undercut percentage">
            <SliderWithValue
              value={s.autoBidUndercutPct}
              onChange={(v) => upd("autoBidUndercutPct", v)}
              min={1}
              max={15}
              suffix="%"
              disabled={!s.autoBidEnabled}
            />
          </Row>
        ) : null}

        {s.autoBidStrategy === "fixed_offset" ? (
          <Row label="Undercut amount">
            <input
              type="number"
              min={0}
              max={500}
              step={0.5}
              value={(s.autoBidFixedOffsetPence / 100).toFixed(2)}
              onChange={(e) =>
                upd("autoBidFixedOffsetPence", Math.round(Number(e.target.value || 0) * 100))
              }
              disabled={!s.autoBidEnabled}
              className={cn(inputCls, "max-w-[160px]")}
            />
            <span className="ml-2 text-[12px] font-light text-black/55">£ below listed</span>
          </Row>
        ) : null}

        <Row label="Your maker floor">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={500}
              step={0.5}
              value={(s.autoBidMakerFloorPence / 100).toFixed(2)}
              onChange={(e) =>
                upd("autoBidMakerFloorPence", Math.round(Number(e.target.value || 0) * 100))
              }
              disabled={!s.autoBidEnabled}
              className={cn(inputCls, "max-w-[140px]")}
            />
            <span className="text-[12px] font-light text-black/60 leading-snug">
              £ minimum per job. Auto-bid is skipped (with a heads-up notification) when the strategy would land below this OR below the platform fee.
            </span>
          </div>
        </Row>

        <Row label="ETA hours">
          <input
            type="number"
            min={1}
            max={336}
            value={s.autoBidEtaHours}
            onChange={(e) => upd("autoBidEtaHours", Number(e.target.value || 1))}
            disabled={!s.autoBidEnabled}
            className={cn(inputCls, "max-w-[120px]")}
          />
        </Row>

        <Row label="Optional message">
          <textarea
            value={s.autoBidMessage ?? ""}
            onChange={(e) => upd("autoBidMessage", e.target.value.slice(0, 200))}
            placeholder="e.g. Bambu X1C, AMS, fast turnaround."
            disabled={!s.autoBidEnabled}
            rows={2}
            maxLength={200}
            className={cn(inputCls, "resize-y")}
          />
        </Row>

        <Row label="Visibility">
          <label className="flex items-start gap-2 text-[12px] font-light text-black/70 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={s.autoBidBadgeVisible}
              onChange={(e) => upd("autoBidBadgeVisible", e.target.checked)}
              disabled={!s.autoBidEnabled}
              className="w-4 h-4 mt-0.5"
            />
            <span>
              Show an &ldquo;auto-bid&rdquo; badge to creators on these bids — transparency tends to improve win rate.
            </span>
          </label>
        </Row>
      </Section>

      <div className="flex items-center justify-between gap-4 px-6 py-4 bg-black/[0.02]">
        <div className="text-[12px] font-light text-black/55">
          {error ? (
            <span className="text-red-700">{error}</span>
          ) : savedAt ? (
            <span className="text-emerald-700">Saved.</span>
          ) : (
            <span>Changes save when you tap the button.</span>
          )}
        </div>
        <Button onClick={onSave} disabled={pending} size="md" withArrow>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  toggleLabel,
  toggleOn,
  onToggle,
  body,
  warningWhenOn,
  children,
}: {
  title: string;
  toggleLabel: string;
  toggleOn: boolean;
  onToggle: (v: boolean) => void;
  body: string;
  warningWhenOn?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("px-6 py-6 transition-opacity", !toggleOn && "opacity-90")}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <MonoLabel size="md" className="block mb-2">
            {title}
          </MonoLabel>
          <p className="text-sm font-light text-black/60 max-w-xl leading-relaxed">
            {body}
          </p>
          {warningWhenOn && toggleOn ? (
            <p className="mt-2 text-[12px] font-light text-amber-800 bg-amber-500/[0.10] border border-amber-500/30 rounded-md px-3 py-2 max-w-xl">
              {warningWhenOn}
            </p>
          ) : null}
        </div>
        <Toggle label={toggleLabel} on={toggleOn} onChange={onToggle} />
      </div>
      {toggleOn ? <div className="flex flex-col gap-4 mt-4">{children}</div> : null}
    </section>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 select-none cursor-pointer">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          "relative w-10 h-6 rounded-full transition-colors",
          on ? "bg-[#7c3aed]" : "bg-black/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
            on && "translate-x-4",
          )}
        />
      </button>
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-2 md:gap-4">
      <div className={labelCls + " md:pt-2"}>{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CoverageControls({
  global,
  radiusKm,
  disabled,
  onGlobal,
  onRadius,
}: {
  global: boolean;
  radiusKm: number;
  disabled: boolean;
  onGlobal: (v: boolean) => void;
  onRadius: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-[12px] font-light text-black/70 select-none cursor-pointer">
        <input
          type="checkbox"
          checked={global}
          onChange={(e) => onGlobal(e.target.checked)}
          disabled={disabled}
          className="w-4 h-4"
        />
        Global · any UK location
      </label>
      <div className={cn("flex items-center gap-3", global && "opacity-50")}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={radiusKm}
          onChange={(e) => onRadius(Number(e.target.value))}
          disabled={disabled || global}
          className="flex-1"
        />
        <span className="font-mono text-sm tabular-nums whitespace-nowrap">{radiusKm} km</span>
      </div>
    </div>
  );
}

function SegRadio<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-full border border-black/[0.10] bg-white p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={cn(
            "px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50",
            value === o.value ? "bg-[#0a0a0a] text-white" : "text-black/55 hover:text-black",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RadioStack<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string; detail: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex items-start gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
            value === o.value
              ? "border-[#0a0a0a] bg-black/[0.04]"
              : "border-black/[0.10] hover:border-black/30",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <input
            type="radio"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            disabled={disabled}
            className="w-4 h-4 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-[12px] font-light text-black/55 mt-0.5 leading-snug">
              {o.detail}
            </div>
          </div>
        </label>
      ))}
    </div>
  );
}

function SliderWithValue({
  value,
  onChange,
  min,
  max,
  suffix,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="flex-1"
      />
      <span className="font-mono text-sm tabular-nums whitespace-nowrap">
        {value}
        {suffix ?? ""}
      </span>
    </div>
  );
}
