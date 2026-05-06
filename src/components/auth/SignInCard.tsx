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

type Mode = "google" | "email-signin" | "email-signup";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-black/[0.10] bg-white text-sm font-light placeholder:text-black/35 focus:border-black/40 focus:outline-none";
const labelCls =
  "block font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1";

export function SignInCard({
  callbackUrl = "/",
  defaultMode = "google",
}: {
  callbackUrl?: string;
  defaultMode?: Mode;
}) {
  const [mode, setMode] = React.useState<Mode>(defaultMode);
  return (
    <div className="flex flex-col gap-5">
      {mode === "google" ? (
        <GoogleSignIn callbackUrl={callbackUrl} onUseEmail={() => setMode("email-signin")} />
      ) : (
        <EmailAuthForm
          mode={mode}
          callbackUrl={callbackUrl}
          onSwitchMode={(m) => setMode(m)}
        />
      )}
    </div>
  );
}

function GoogleSignIn({
  callbackUrl,
  onUseEmail,
}: {
  callbackUrl: string;
  onUseEmail: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);
  return (
    <>
      <TermsTickbox accepted={accepted} setAccepted={setAccepted} />
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
        <MonoLabel size="sm">Or</MonoLabel>
        <div className="h-px flex-1 bg-black/10" />
      </div>
      <button
        type="button"
        onClick={onUseEmail}
        disabled={!accepted}
        className="w-full font-mono text-[11px] uppercase tracking-[0.18em] text-black/65 hover:text-black underline underline-offset-4 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
      >
        Continue with email + password →
      </button>
      <div className="text-[12px] font-light text-black/55 leading-relaxed text-center">
        We only see your name, email, and profile photo. We never read or
        post to your Google account.
      </div>
    </>
  );
}

function EmailAuthForm({
  mode,
  callbackUrl,
  onSwitchMode,
}: {
  mode: "email-signin" | "email-signup";
  callbackUrl: string;
  onSwitchMode: (m: Mode) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [postSignup, setPostSignup] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "email-signup") {
        const r = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, name: name || null }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `signup failed (${r.status})`);
        }
        setPostSignup(email);
      } else {
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (!result || result.error) {
          if (result?.error === "EMAIL_NOT_VERIFIED" || /EMAIL_NOT_VERIFIED/i.test(result?.error ?? "")) {
            throw new Error(
              "Your email isn't verified yet. Check your inbox for the verification link.",
            );
          }
          throw new Error("Wrong email or password.");
        }
        window.location.replace(callbackUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  if (postSignup) {
    return (
      <div className="text-center space-y-4 py-4">
        <MonoLabel size="md" className="block !text-black">
          Check your inbox
        </MonoLabel>
        <p className="text-sm font-light text-black/65 leading-relaxed">
          We&rsquo;ve sent a verification link to{" "}
          <strong className="text-[#0a0a0a]">{postSignup}</strong>. Tap the
          button in that email and you&rsquo;ll be signed in. The link
          works for 24 hours.
        </p>
        <button
          type="button"
          onClick={() => {
            setPostSignup(null);
            setPassword("");
            onSwitchMode("email-signin");
          }}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black underline underline-offset-4"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  const isSignup = mode === "email-signup";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <TermsTickbox accepted={accepted} setAccepted={setAccepted} />
      {isSignup ? (
        <div>
          <label htmlFor="signup-name" className={labelCls}>
            Display name <span className="text-black/35 normal-case tracking-normal font-light">(optional)</span>
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={inputCls}
            maxLength={80}
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="auth-email" className={labelCls}>Email</label>
        <input
          id="auth-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="auth-password" className={labelCls}>
          Password{isSignup ? " · 10+ characters" : ""}
        </label>
        <input
          id="auth-password"
          type="password"
          required
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isSignup ? "Pick something memorable" : "Your password"}
          className={inputCls}
          minLength={isSignup ? 10 : undefined}
          maxLength={200}
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
        disabled={pending || !accepted}
        className="w-full justify-center disabled:opacity-50"
      >
        {pending
          ? isSignup ? "Creating account…" : "Signing in…"
          : !accepted
            ? "Tick the box first"
            : isSignup ? "Create account" : "Sign in"}
      </Button>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => onSwitchMode(isSignup ? "email-signin" : "email-signup")}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black underline underline-offset-4"
        >
          {isSignup ? "Already have an account?" : "New here? Create account"}
        </button>
        {!isSignup ? (
          <Link
            href="/account/forgot-password"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black underline underline-offset-4"
          >
            Forgot password?
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onSwitchMode("google")}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 hover:text-black"
      >
        ← Use Google instead
      </button>
    </form>
  );
}

function TermsTickbox({
  accepted,
  setAccepted,
}: {
  accepted: boolean;
  setAccepted: (v: boolean) => void;
}) {
  return (
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
  );
}
