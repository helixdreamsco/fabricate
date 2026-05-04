"use client";
import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export function ConsentForm({
  needsTerms,
  needsPrivacy,
  termsVersion,
  privacyVersion,
  redirectTo,
}: {
  needsTerms: boolean;
  needsPrivacy: boolean;
  termsVersion: number;
  privacyVersion: number;
  redirectTo: string;
}) {
  const { update } = useSession();
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Already accepted → don't require a tick (e.g. reading new privacy
  // alone shouldn't ask for re-tick of terms).
  const termsOk = !needsTerms || acceptTerms;
  const privacyOk = !needsPrivacy || acceptPrivacy;
  const ready = termsOk && privacyOk;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/legal/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acceptTerms: needsTerms ? acceptTerms : true,
          acceptPrivacy: needsPrivacy ? acceptPrivacy : true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `failed (${res.status})`);
      }
      // Refresh the JWT so the middleware sees the new accepted versions,
      // then hard-navigate so the browser ships the fresh cookie and the
      // consent middleware re-evaluates from scratch. A soft router.replace
      // here races the cookie write and lands on a blank page in Next 15.
      await update({
        acceptedTermsVersion: termsVersion,
        acceptedPrivacyVersion: privacyVersion,
      });
      window.location.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {needsTerms ? (
        <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-black/[0.08] p-3 hover:border-black/25 transition-colors">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="w-4 h-4 mt-0.5"
            required
          />
          <span className="block flex-1 text-sm font-light text-black/75 leading-snug">
            I have read and accept the{" "}
            <Link
              href="/terms"
              target="_blank"
              className="underline underline-offset-2"
            >
              Terms of Service
            </Link>{" "}
            (v{termsVersion}).
          </span>
        </label>
      ) : null}

      {needsPrivacy ? (
        <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-black/[0.08] p-3 hover:border-black/25 transition-colors">
          <input
            type="checkbox"
            checked={acceptPrivacy}
            onChange={(e) => setAcceptPrivacy(e.target.checked)}
            className="w-4 h-4 mt-0.5"
            required
          />
          <span className="block flex-1 text-sm font-light text-black/75 leading-snug">
            I have read and accept the{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="underline underline-offset-2"
            >
              Privacy Policy
            </Link>{" "}
            (v{privacyVersion}).
          </span>
        </label>
      ) : null}

      {error ? (
        <div className="text-sm text-red-600 font-light">{error}</div>
      ) : null}

      <button
        type="submit"
        disabled={!ready || pending}
        className="w-full rounded-lg border border-black/[0.15] bg-black text-white px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] disabled:opacity-50"
      >
        {pending ? "Saving…" : "Continue to Fabricate"}
      </button>
    </form>
  );
}
