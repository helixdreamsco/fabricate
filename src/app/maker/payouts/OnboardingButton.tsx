"use client";
import * as React from "react";
import { Button } from "@/components/ui/Button";

export function OnboardingButton({
  onboarded,
  ctaLabel,
}: {
  onboarded: boolean;
  ctaLabel?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/maker/onboard", { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `failed (${r.status})`);
        return;
      }
      const { onboardingUrl } = await r.json();
      window.location.href = onboardingUrl;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button size="lg" withArrow onClick={start} disabled={busy}>
        {busy ? "Starting…" : (ctaLabel ?? (onboarded ? "Manage Stripe" : "Connect payouts"))}
      </Button>
      {err ? <div className="text-xs text-red-600 font-light">{err}</div> : null}
    </div>
  );
}
