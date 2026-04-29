"use client";
import * as React from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.05-3.72 1.05-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.85 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.67-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.1 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.67 2.84C6.72 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function SignInCard({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const [pending, setPending] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);
  return (
    <div className="flex flex-col gap-6">
      <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-black/[0.08] p-3 hover:border-black/25 transition-colors">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="w-4 h-4 mt-0.5"
        />
        <span className="block flex-1 text-[12px] font-light text-black/70 leading-snug">
          I have read and accept the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="underline underline-offset-2 hover:text-black"
          >
            Terms of Service
          </Link>
          ,{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="underline underline-offset-2 hover:text-black"
          >
            Privacy Policy
          </Link>
          , and{" "}
          <Link
            href="/acceptable-use"
            target="_blank"
            className="underline underline-offset-2 hover:text-black"
          >
            Acceptable Use Policy
          </Link>
          .
        </span>
      </label>
      <Button
        type="button"
        size="lg"
        disabled={pending || !accepted}
        onClick={() => {
          setPending(true);
          signIn("google", { callbackUrl });
        }}
        className="w-full justify-center !bg-white !text-[#0a0a0a] !border-black/15 hover:!bg-black/[0.04] disabled:opacity-50"
        startIcon={<GoogleGlyph className="w-4 h-4 mr-2" />}
      >
        {pending
          ? "Redirecting…"
          : accepted
            ? "Continue with Google"
            : "Tick the box first"}
      </Button>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-black/10" />
        <MonoLabel size="sm">More providers soon</MonoLabel>
        <div className="h-px flex-1 bg-black/10" />
      </div>
      <div className="text-[12px] font-light text-black/55 leading-relaxed text-center">
        We only see your name, email, and profile photo. We never read or
        post to your Google account.
      </div>
    </div>
  );
}
