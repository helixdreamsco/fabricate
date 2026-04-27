"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";

type CommunityShape = {
  id: string;
  slug: string;
  inviteCode: string;
  name: string;
  description: string | null;
  iconHue: number;
  ownerId: string;
  discountPct: number;
  freeMode: boolean;
  priorityQueue: boolean;
  memberOnlyMakers: boolean;
  createdAt: string;
  updatedAt: string;
};

export function CommunitySettingsForm({
  community: initial,
}: {
  community: CommunityShape;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initial.name);
  const [description, setDescription] = React.useState(initial.description ?? "");
  const [discountPct, setDiscountPct] = React.useState(initial.discountPct);
  const [freeMode, setFreeMode] = React.useState(initial.freeMode);
  const [priorityQueue, setPriorityQueue] = React.useState(initial.priorityQueue);
  const [memberOnlyMakers, setMemberOnlyMakers] = React.useState(
    initial.memberOnlyMakers,
  );
  const [inviteCode, setInviteCode] = React.useState(initial.inviteCode);
  const [savedFlash, setSavedFlash] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const inviteUrl =
    typeof window === "undefined"
      ? `/j/${inviteCode}`
      : `${window.location.origin}/j/${inviteCode}`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/communities/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          discountPct: freeMode ? 100 : discountPct,
          freeMode,
          priorityQueue,
          memberOnlyMakers,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const rotate = async () => {
    if (
      !confirm(
        "Rotate the invite code? The old link will stop working immediately.",
      )
    )
      return;
    const res = await fetch(`/api/communities/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotateInviteCode: true }),
    });
    if (res.ok) {
      const j = await res.json();
      setInviteCode(j.community.inviteCode);
      router.refresh();
    }
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const del = async () => {
    const confirmed = prompt(
      `Type "${initial.name}" to confirm deletion. This removes all members and messages.`,
    );
    if (confirmed !== initial.name) return;
    const res = await fetch(`/api/communities/${initial.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/communities");
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <Card className="p-6 md:p-8 flex flex-col gap-6">
        <MonoLabel size="md" className="!text-black">
          Basics
        </MonoLabel>
        <Field label="Name">
          <Input
            required
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description">
          <Input
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="p-6 md:p-8 flex flex-col gap-6">
        <MonoLabel size="md" className="!text-black">
          Invite link
        </MonoLabel>
        <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-[#fafafa] px-3 py-2.5">
          <span className="font-mono text-[11px] tabular-nums truncate flex-1 text-black/70">
            {inviteUrl}
          </span>
          <button
            type="button"
            onClick={copyInvite}
            className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-black/60 hover:text-black transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
          <button
            type="button"
            onClick={rotate}
            className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-black/60 hover:text-black transition-colors"
            title="Rotate invite code — the old link stops working"
          >
            <RefreshCw className="w-3 h-3" />
            Rotate
          </button>
        </div>
      </Card>

      <Card className="p-6 md:p-8 flex flex-col gap-6">
        <MonoLabel size="md" className="!text-black">
          Terms & policy
        </MonoLabel>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <MonoLabel size="sm">Member discount</MonoLabel>
            <span className="font-mono text-sm font-bold tabular-nums">
              {freeMode ? "100%" : `${discountPct}%`}
            </span>
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
        </div>
        <Toggle
          label="Free prints for members"
          detail="Overrides the discount — members pay £0 on community makers."
          value={freeMode}
          onChange={(v) => {
            setFreeMode(v);
            if (v) setDiscountPct(100);
          }}
        />
        <Toggle
          label="Priority queue"
          detail="Community jobs jump ahead of public jobs on community makers."
          value={priorityQueue}
          onChange={setPriorityQueue}
        />
        <Toggle
          label="Members-only"
          detail="Hide community details from non-members."
          value={memberOnlyMakers}
          onChange={setMemberOnlyMakers}
        />
      </Card>

      <Card className="p-5 md:p-6 bg-black/[0.02]">
        <MonoLabel size="md" className="!text-black mb-2 block">
          Makers
        </MonoLabel>
        <p className="text-sm font-light text-black/65 leading-relaxed">
          The community auto-shows any member who has set up a maker
          profile — no curation needed. Members can become makers from{" "}
          <span className="font-mono text-[12px]">/maker/profile</span>.
        </p>
      </Card>

      {error ? (
        <div className="text-[13px] font-mono text-[#ef4444]">{error}</div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {savedFlash ? (
          <MonoLabel size="sm" className="!text-[#10b981]">
            Saved · members see updates instantly
          </MonoLabel>
        ) : null}
        <Button type="submit" size="lg" withArrow disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <Card className="p-6 md:p-8 mt-6 border-[#ef4444]/20">
        <div className="flex items-center justify-between">
          <div>
            <MonoLabel size="md" className="!text-[#b91c1c] block mb-2">
              Danger zone
            </MonoLabel>
            <p className="text-sm font-light text-black/60 max-w-md">
              Delete this community. Members and messages are removed.
              Cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={del}
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#ef4444] hover:text-[#b91c1c] transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Delete community
          </button>
        </div>
      </Card>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
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
