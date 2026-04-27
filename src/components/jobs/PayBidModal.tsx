"use client";
import * as React from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { X, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatGbp } from "@/lib/money";

/**
 * Payment modal for live-mode bid acceptance.
 *
 * Flow:
 *   1. POST /api/jobs/:id/bids/:bidId/intent → returns clientSecret
 *   2. Mount Stripe Elements with that clientSecret + PaymentElement
 *   3. User submits → stripe.confirmPayment({ redirect: 'if_required' })
 *   4. On `paymentIntent.status === 'succeeded'` → POST /accept with the
 *      paymentIntentId. The server verifies and finalises the assignment.
 *
 * Sim mode never opens this modal — `CreatorBidPanel` calls /accept directly.
 */

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

export function PayBidModal({
  jobId,
  bidId,
  amountPence,
  publishableKey,
  payerName,
  payerEmail,
  onClose,
  onSuccess,
}: {
  jobId: string;
  bidId: string;
  amountPence: number;
  publishableKey: string;
  /** Pre-fills Stripe's billing details so the user doesn't retype their
   *  name/email and the Link "save info" prompt becomes one-click. */
  payerName?: string | null;
  payerEmail?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [intentId, setIntentId] = React.useState<string | null>(null);
  const [initError, setInitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}/bids/${bidId}/intent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `intent creation failed (${r.status})`);
        }
        const { clientSecret: cs, paymentIntentId } = await r.json();
        if (cancelled) return;
        setClientSecret(cs);
        setIntentId(paymentIntentId);
      } catch (e) {
        if (cancelled) return;
        setInitError(e instanceof Error ? e.message : "could not start payment");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, bidId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-black/[0.08] shadow-xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between gap-3 shrink-0">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
              Authorize payment
            </div>
            <div className="text-lg font-bold tabular-nums leading-tight mt-0.5">
              {formatGbp(amountPence)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-black/[0.06] transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto flex-1">
          {initError ? (
            <div className="text-sm text-red-600 font-light">{initError}</div>
          ) : !clientSecret ? (
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 text-center py-8">
              Preparing secure payment…
            </div>
          ) : (
            <Elements
              stripe={getStripe(publishableKey)}
              options={{
                clientSecret,
                appearance: {
                  theme: "flat",
                  variables: {
                    colorPrimary: "#0a0a0a",
                    colorBackground: "#ffffff",
                    colorText: "#0a0a0a",
                    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                    borderRadius: "10px",
                  },
                },
              }}
            >
              <PaymentInner
                jobId={jobId}
                bidId={bidId}
                intentId={intentId!}
                amountPence={amountPence}
                onSuccess={onSuccess}
                payerName={payerName}
                payerEmail={payerEmail}
              />
            </Elements>
          )}

          <div className="mt-5 flex items-start gap-2 text-xs font-light text-black/55 leading-relaxed">
            <Lock className="w-3 h-3 text-black/40 shrink-0 mt-0.5" strokeWidth={2.2} />
            <span>
              Card details handled by Stripe — they never touch our servers.
              Funds are held by Fabricate until pickup is verified, then
              released to the maker.
            </span>
          </div>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-700">
            Stripe test mode · use card 4242 4242 4242 4242, any future date, any CVC
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentInner({
  jobId,
  bidId,
  intentId,
  amountPence,
  onSuccess,
  payerName,
  payerEmail,
}: {
  jobId: string;
  bidId: string;
  intentId: string;
  amountPence: number;
  onSuccess: () => void;
  payerName?: string | null;
  payerEmail?: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setErr(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setErr(error.message ?? "payment failed");
      setBusy(false);
      return;
    }
    if (paymentIntent?.status !== "succeeded") {
      setErr(`payment ended in state ${paymentIntent?.status ?? "unknown"}`);
      setBusy(false);
      return;
    }

    // Tell the server to finalise the bid acceptance now that Stripe says
    // the PaymentIntent is succeeded.
    try {
      const r = await fetch(`/api/jobs/${jobId}/bids/${bidId}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentIntentId: intentId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? `accept failed (${r.status})`);
        setBusy(false);
        return;
      }
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "network error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={pay} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
          defaultValues: {
            billingDetails: {
              name: payerName ?? undefined,
              email: payerEmail ?? undefined,
            },
          },
        }}
      />
      {err ? <div className="text-sm text-red-600 font-light">{err}</div> : null}
      <Button
        type="submit"
        size="xl"
        className="w-full"
        withArrow
        disabled={!stripe || !elements || busy}
      >
        {busy ? "Processing…" : `Pay ${formatGbp(amountPence)}`}
      </Button>
    </form>
  );
}
