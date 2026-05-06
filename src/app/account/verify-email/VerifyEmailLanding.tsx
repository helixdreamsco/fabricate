"use client";
import * as React from "react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Button } from "@/components/ui/Button";

type State =
  | { kind: "verifying" }
  | { kind: "success"; email: string }
  | { kind: "error"; message: string };

export function VerifyEmailLanding({ token }: { token: string }) {
  const [state, setState] = React.useState<State>({ kind: "verifying" });

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `verify failed (${r.status})`);
        }
        const j = await r.json();
        if (!cancelled) setState({ kind: "success", email: j.email });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Something went wrong.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === "verifying") {
    return (
      <div className="text-center space-y-3 py-4">
        <MonoLabel size="md" className="block">Verifying…</MonoLabel>
        <div className="h-1 w-full rounded-full bg-black/[0.06] overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-[#7c3aed] animate-[upload-bar_1.2s_ease-in-out_infinite]" />
        </div>
      </div>
    );
  }
  if (state.kind === "success") {
    return (
      <div className="text-center space-y-4 py-2">
        <MonoLabel size="md" className="block !text-black">
          Email verified ✓
        </MonoLabel>
        <p className="text-sm font-light text-black/65 leading-relaxed">
          <strong className="text-[#0a0a0a]">{state.email}</strong> is now
          confirmed. Sign in to start using Fabricate.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={() => window.location.replace("/account")}
          className="w-full justify-center"
        >
          Sign in
        </Button>
      </div>
    );
  }
  return (
    <div className="text-center space-y-4 py-2">
      <MonoLabel size="md" className="block !text-red-700">
        Verification failed
      </MonoLabel>
      <p className="text-sm font-light text-red-700 leading-relaxed">
        {state.message}
      </p>
      <p className="text-[12px] font-light text-black/55 leading-relaxed">
        Sign up again or sign in — if your email is already verified the
        sign-in flow will let you through.
      </p>
    </div>
  );
}
