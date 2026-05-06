"use client";
import * as React from "react";
import { useSession } from "next-auth/react";
import { MonoLabel } from "@/components/ui/MonoLabel";

/**
 * Bridge component for the case where the DB confirms the user has already
 * accepted the current Terms / Privacy versions, but their JWT still carries
 * stale `acceptedTermsVersion` / `acceptedPrivacyVersion` numbers (because
 * they accepted on another device / browser, then opened a session with a
 * cached JWT).
 *
 * Without this, the page would server-redirect to `next`, the middleware
 * would read the stale JWT and redirect back to /legal/accept, and the
 * browser would loop until it gives up. By forcing a JWT refresh here and
 * then hard-navigating, we mint a fresh cookie before the next request
 * hits the middleware.
 */
export function RefreshSessionAndGo({
  next,
  termsVersion,
  privacyVersion,
}: {
  next: string;
  termsVersion: number;
  privacyVersion: number;
}) {
  const { update } = useSession();
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await update({
          acceptedTermsVersion: termsVersion,
          acceptedPrivacyVersion: privacyVersion,
        });
      } catch {
        // If update fails we still hard-nav — middleware will re-evaluate
        // with whatever cookie the browser has and the worst case is we
        // re-render this component once, which retries the update.
      }
      if (!cancelled) window.location.replace(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [next, termsVersion, privacyVersion, update]);

  return (
    <div className="flex-1 flex items-center justify-center py-16">
      <MonoLabel size="md">Refreshing your session…</MonoLabel>
    </div>
  );
}
