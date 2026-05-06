"use client";
import * as React from "react";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-black/[0.10] bg-white text-sm font-light placeholder:text-black/35 focus:border-black/40 focus:outline-none";

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Always pretend success — server already shapes response that way
      // to avoid leaking which emails are registered. A network error is
      // the only thing the user might want to know about, but rather
      // than expose differential behaviour we just show success.
    }
    setSubmitted(true);
    setPending(false);
  };

  if (submitted) {
    return (
      <div className="text-center space-y-4 py-2">
        <MonoLabel size="md" className="block !text-black">
          Check your inbox
        </MonoLabel>
        <p className="text-sm font-light text-black/65 leading-relaxed">
          If an account exists for{" "}
          <strong className="text-[#0a0a0a]">{email}</strong>, you&rsquo;ll
          receive a password-reset email shortly. The link is valid for one
          hour.
        </p>
        <p className="text-[12px] font-light text-black/55 leading-relaxed">
          Didn&rsquo;t arrive? Check spam, or wait a minute and try again.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label
          htmlFor="forgot-email"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1"
        >
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className={inputCls}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="w-full justify-center"
      >
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
