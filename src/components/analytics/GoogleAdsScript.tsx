import Script from "next/script";

/**
 * Google Ads gtag for conversion tracking (AW-18158646394).
 * Loads only in production builds so dev pageviews don't pollute Ads data.
 *
 * Conversion events fire via window.gtag('event', 'conversion', { send_to,
 * value, currency }) — see trackAdsConversion() in src/lib/analytics.ts.
 */
const GOOGLE_ADS_ID = "AW-18158646394";

export function GoogleAdsScript() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
    <>
      <Script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${GOOGLE_ADS_ID}');`}
      </Script>
    </>
  );
}
