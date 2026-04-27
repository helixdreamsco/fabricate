"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";

export function CreateCommunityForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [discountPct, setDiscountPct] = React.useState(15);
  const [freeMode, setFreeMode] = React.useState(false);
  const [priorityQueue, setPriorityQueue] = React.useState(false);
  const [memberOnlyMakers, setMemberOnlyMakers] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (name.trim().length < 2) {
      setError("Give your community a name (2+ characters).");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          discountPct,
          freeMode,
          priorityQueue,
          memberOnlyMakers,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      router.push(`/c/${j.community.slug}`);
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Card className="p-6 md:p-8 flex flex-col gap-6">
        <MonoLabel size="md" className="!text-black">
          Basics
        </MonoLabel>
        <Field label="Name">
          <Input
            required
            autoFocus
            placeholder="Studio 34, Class of ’27, Board Game Club…"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description (optional)">
          <Input
            placeholder="Who is this for and what do you print together?"
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="p-6 md:p-8 flex flex-col gap-6">
        <MonoLabel size="md" className="!text-black">
          Terms & policy
        </MonoLabel>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Field label="Member discount" compact>
              <span className="font-mono text-sm font-bold tabular-nums">
                {freeMode ? "100%" : `${discountPct}%`}
              </span>
            </Field>
          </div>
          <input
            type="range"
            className="thin"
            min={0}
            max={100}
            step={5}
            disabled={freeMode}
            value={freeMode ? 100 : discountPct}
            onChange={(e) => setDiscountPct(Number(e.target.value))}
          />
          <div className="flex justify-between mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-black/35">
            <span>No discount</span>
            <span>Half price</span>
            <span>Free</span>
          </div>
        </div>

        <Toggle
          label="Free prints for members"
          detail="Members always pay £0 on community-affiliated makers."
          value={freeMode}
          onChange={(v) => {
            setFreeMode(v);
            if (v) setDiscountPct(100);
          }}
        />
        <Toggle
          label="Priority queue"
          detail="Community jobs skip ahead of public jobs on community makers."
          value={priorityQueue}
          onChange={setPriorityQueue}
        />
        <Toggle
          label="Members-only makers"
          detail="Community-affiliated makers are hidden from non-members."
          value={memberOnlyMakers}
          onChange={setMemberOnlyMakers}
        />
      </Card>

      {error ? (
        <div className="text-[13px] font-mono text-[#ef4444]">{error}</div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <MonoLabel size="sm">
          You&rsquo;ll be able to add makers after creating.
        </MonoLabel>
        <Button type="submit" size="lg" withArrow disabled={pending}>
          {pending ? "Creating…" : "Create community"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <label className={compact ? "flex items-center gap-3" : "flex flex-col gap-2"}>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/40">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-start gap-4 text-left w-full hover:bg-black/[0.02] -mx-2 px-2 py-1 rounded-lg transition-colors"
    >
      <div className="flex-1">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[12px] font-light text-black/55 mt-0.5">
          {detail}
        </div>
      </div>
      <span
        className={
          "mt-1 shrink-0 relative w-10 h-6 rounded-full transition-colors " +
          (value ? "bg-[#0a0a0a]" : "bg-black/15")
        }
      >
        <span
          className={
            "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all " +
            (value ? "left-5" : "left-1")
          }
        />
      </span>
    </button>
  );
}
