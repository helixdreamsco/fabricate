import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Fabricate — London's 3D Printing Marketplace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Default Open Graph card. Pure-CSS rendering via @vercel/og — keeps
 * the asset 0KB on disk and renders fresh per request.
 */
export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 80px",
          background:
            "linear-gradient(135deg, #7c3aed 0%, #5b21b6 60%, #1e1b4b 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 18,
            letterSpacing: 5,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 9999,
              background: "white",
            }}
          />
          fabricate · helixdreamsco
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: -3,
            }}
          >
            Bring your design
            <br />
            to life.
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 300,
              opacity: 0.85,
              maxWidth: 920,
              lineHeight: 1.3,
            }}
          >
            London&apos;s 3D-printing marketplace. Upload an STL, get a quote
            in 30 seconds, and a local maker prints it. For creators, hobbyists,
            and indie founders.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 16,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <div style={{ display: "flex" }}>0% service fee · launch promo</div>
          <div style={{ display: "flex" }}>fabricate.helixdreams.co</div>
        </div>
      </div>
    ),
    size,
  );
}
