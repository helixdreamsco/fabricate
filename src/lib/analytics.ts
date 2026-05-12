declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export type FabricateEvent =
  | "upload_started"
  | "configure_viewed"
  | "checkout_viewed"
  | "checkout_submitted"
  | "job_posted"
  | "signin_completed"
  | "maker_signup_started"
  | "waitlist_joined"
  | "landing_cta_clicked";

export function track(
  event: FabricateEvent,
  props?: Record<string, string | number | boolean>,
) {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    // analytics must never break the app
  }
}

/**
 * Fire a Google Ads conversion event. Get the `sendTo` value from Google Ads
 * → Tools → Conversions → [your action] — it looks like "AW-XXX/abcDEFghi".
 * Optional value + currency feed Smart Bidding when we have order amounts.
 */
export function trackAdsConversion(
  sendTo: string,
  options?: { value?: number; currency?: string; transactionId?: string },
) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", "conversion", {
      send_to: sendTo,
      value: options?.value,
      currency: options?.currency ?? "GBP",
      transaction_id: options?.transactionId,
    });
  } catch {
    // analytics must never break the app
  }
}
