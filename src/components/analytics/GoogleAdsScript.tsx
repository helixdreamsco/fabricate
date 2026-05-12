/**
 * Google Ads gtag for conversion tracking (AW-18158646394). Renders raw
 * <script> tags inside <head> — Google Ads' tag-install verifier inspects
 * static HTML and Next.js's <Script afterInteractive> defers injection
 * to body which the verifier misses.
 *
 * Conversion events fire via window.gtag('event', 'conversion', { send_to,
 * value, currency }) — see trackAdsConversion() in src/lib/analytics.ts.
 *
 * Loads only in production builds so dev pageviews don't pollute Ads data.
 */
const GOOGLE_ADS_ID = "AW-18158646394";

export function GoogleAdsScript() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${GOOGLE_ADS_ID}');`,
        }}
      />
    </>
  );
}
