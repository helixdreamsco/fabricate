"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

type KindRow = { kind: string; label: string; description: string };

export function NotificationPreferencesForm({
  initialPrefs,
  kinds,
}: {
  initialPrefs: Record<string, { email?: boolean; inApp?: boolean }>;
  kinds: KindRow[];
}) {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState(initialPrefs);
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const get = (kind: string, channel: "email" | "inApp") => {
    const v = prefs[kind]?.[channel];
    return v !== false; // default = on
  };

  const set = (kind: string, channel: "email" | "inApp", value: boolean) => {
    setPrefs((p) => ({
      ...p,
      [kind]: { ...p[kind], [channel]: value },
    }));
    setSaved(false);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `failed (${res.status})`);
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSave} className="space-y-3">
      <div className="rounded-xl border border-black/[0.08]">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 border-b border-black/[0.06] font-mono text-[10px] uppercase tracking-[0.18em] text-black/55">
          <div>Category</div>
          <div className="text-center">In-app</div>
          <div className="text-center">Email</div>
        </div>
        <ul>
          {kinds.map((k) => (
            <li
              key={k.kind}
              className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 border-b border-black/[0.04] last:border-b-0 items-center"
            >
              <div>
                <div className="text-sm font-medium">{k.label}</div>
                <div className="text-[12px] font-light text-black/55 leading-snug">
                  {k.description}
                </div>
              </div>
              <input
                type="checkbox"
                checked={get(k.kind, "inApp")}
                onChange={(e) => set(k.kind, "inApp", e.target.checked)}
                className="w-4 h-4"
              />
              <input
                type="checkbox"
                checked={get(k.kind, "email")}
                onChange={(e) => set(k.kind, "email", e.target.checked)}
                className="w-4 h-4"
              />
            </li>
          ))}
        </ul>
      </div>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}
      {saved ? <div className="text-xs text-emerald-700">Saved.</div> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-black/[0.15] bg-black text-white px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save preferences"}
      </button>
    </form>
  );
}
