"use client";
import * as React from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-black/[0.10] bg-white text-sm font-light placeholder:text-black/35 focus:border-black/40 focus:outline-none";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `reset failed (${r.status})`);
      }
      const j = await r.json();
      // Sign the user in immediately so they don't have to retype.
      const result = await signIn("credentials", {
        email: j.email,
        password,
        redirect: false,
      });
      if (!result || result.error) {
        // Reset succeeded but signin failed — send them to /account so
        // they can finish manually.
        window.location.replace("/account");
        return;
      }
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="reset-password"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1"
        >
          New password
        </label>
        <input
          id="reset-password"
          type="password"
          required
          autoComplete="new-password"
          minLength={10}
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label
          htmlFor="reset-confirm"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1"
        >
          Confirm new password
        </label>
        <input
          id="reset-confirm"
          type="password"
          required
          autoComplete="new-password"
          minLength={10}
          maxLength={200}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
        />
      </div>
      {error ? (
        <div className="text-[12px] text-red-700 font-light leading-snug">
          {error}
        </div>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="w-full justify-center"
      >
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
