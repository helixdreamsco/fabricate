import Script from "next/script";

/**
 * Plausible analytics. Loads only in production builds so dev pageviews
 * don't pollute the dashboard. The script URL is the per-account variant
 * Plausible issues from the dashboard — the site config is encoded in the
 * script ID itself, so no data-domain attribute is needed.
 *
 * Custom events fire via window.plausible('event_name', { props }) — see
 * src/lib/analytics.ts.
 */
export function PlausibleScript() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script
        async
        src="https://plausible.io/js/pa-i9IhAQpEPjaeNNkiadeAY.js"
        strategy="afterInteractive"
      />
      <Script id="plausible-init" strategy="afterInteractive">
        {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
      </Script>
    </>
  );
}
