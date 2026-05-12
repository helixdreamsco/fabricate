/**
 * Plausible analytics. Renders raw <script> tags inside <head> so the
 * loader appears in the SSR HTML — Plausible's installation verifier
 * inspects static HTML, and Next.js's <Script afterInteractive> defers
 * injection to the body which the verifier misses.
 *
 * Custom events fire via window.plausible('event_name', { props }) — see
 * src/lib/analytics.ts.
 *
 * Loads only in production builds so dev pageviews don't pollute data.
 */
export function PlausibleScript() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <script
        async
        src="https://plausible.io/js/pa-i9IhAQpEPjaeNNkiadeAY.js"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`,
        }}
      />
    </>
  );
}
