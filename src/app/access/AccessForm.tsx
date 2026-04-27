"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function AccessForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Invalid code");
        return;
      }
      // Cookie is set; redirect target was passed in the form. Use a hard
      // navigation so the proxy re-evaluates the cookie on the way in.
      const dest = redirectTo.startsWith("/") ? redirectTo : "/";
      window.location.href = dest;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-black/[0.08] p-5 sm:p-6">
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 block mb-2">
          Access code
        </span>
        <input
          autoFocus
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-transparent border border-black/15 rounded-lg px-3 py-2.5 text-base font-mono tracking-[0.18em] outline-none focus:border-black/50 transition-colors"
          maxLength={64}
        />
      </label>
      {err ? <div className="text-sm text-red-600 font-light mt-3">{err}</div> : null}
      <Button
        type="submit"
        size="lg"
        withArrow
        disabled={busy || !code.trim()}
        className="w-full mt-4"
      >
        {busy ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
