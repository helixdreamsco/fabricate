"use client";
import * as React from "react";

export function StartIdentityButton({ modeHint }: { modeHint: "live" | "sim" }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onClick = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/maker/verification/identity-session", {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `failed (${res.status})`);
      }
      const j = await res.json();
      window.location.href = j.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-lg border border-black/[0.15] bg-black text-white px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] disabled:opacity-50 transition-opacity"
      >
        {pending ? "Opening Stripe…" : "Verify identity with Stripe"}
      </button>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 mt-2 leading-relaxed">
        {modeHint === "sim"
          ? "Sim mode (no STRIPE_SECRET_KEY) — completes instantly without a real flow."
          : "Stripe opens a hosted page to scan your document and capture a selfie."}
      </p>
      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
