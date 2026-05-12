declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
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
