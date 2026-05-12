"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";

export function ConnectPayoutsButton({ resumed }: { resumed: boolean }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onClick = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/affiliate/onboard", { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `onboarding failed (${r.status})`);
      }
      const j = await r.json();
      if (j?.onboardingUrl) {
        window.location.href = j.onboardingUrl as string;
        return;
      }
      throw new Error("no onboarding URL returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="md"
        onClick={onClick}
        disabled={pending}
        className="w-full justify-center disabled:opacity-50"
      >
        {pending
          ? "Redirecting…"
          : resumed
            ? "Resume Stripe onboarding"
            : "Connect Stripe for payouts"}
      </Button>
      {error ? (
        <div className="text-[12px] text-red-700 font-light leading-snug">
          {error}
        </div>
      ) : null}
    </div>
  );
}
