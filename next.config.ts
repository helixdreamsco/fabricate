import type { NextConfig } from "next";
import path from "node:path";

const API_HOST = process.env.API_HOST ?? "http://127.0.0.1:8000";

// Production security headers. CSP is intentionally permissive on
// 'unsafe-inline' for now because we render some inline-styled SVGs +
// markdown blocks; tighten when we're closer to launch and have a
// nonce-based pipeline.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HSTS — only meaningful when served over HTTPS. Hosts (Vercel etc.)
  // typically add this themselves; harmless to declare.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Restrict browser permissions we don't need. Camera/mic stays open
  // because Stripe Identity opens a hosted page that uses them; that
  // hosted page is on a different origin so this header doesn't gate it.
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), payment=(self)",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Files referenced via fs.readFileSync at runtime that aren't normally
  // traced by webpack/turbopack. Without these the production bundle
  // ships missing files.
  outputFileTracingIncludes: {
    "/api/test-print/**": ["./src/lib/test-print/font.ttf"],
    "/terms": ["./src/content/legal/*.md"],
    "/privacy": ["./src/content/legal/*.md"],
    "/acceptable-use": ["./src/content/legal/*.md"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/py/:path*",
        destination: `${API_HOST}/:path*`,
      },
    ];
  },
  // For Cloud Run / Docker deploys: enable Next.js standalone output so
  // the build artefact is a self-contained server bundle. Vercel ignores
  // this and uses its own pipeline.
  output: "standalone",
  experimental: {
    // src/proxy.ts runs on /api/uploads. Next.js 16 buffers the request
    // body so proxy + route handler can each read it; the default cap is
    // 10MB and anything larger is silently truncated (no error to the
    // client). A truncated multipart body makes req.formData() fail with
    // "expected multipart/form-data". Matched to MAX_UPLOAD_BYTES (2 GiB)
    // in src/lib/upload-validation.ts with headroom for the multipart
    // boundary overhead.
    //
    // ⚠ External cap: Cloud Run rejects requests larger than 32MB by
    // default. To accept truly large uploads in production you also need
    // to either (a) enable HTTP/2 streaming on the Cloud Run service and
    // raise the per-request limit, or (b) switch /api/uploads to a
    // direct-to-GCS signed-URL flow (the only way to get above the
    // platform's hard ceilings). This config alone isn't enough.
    proxyClientMaxBodySize: "2gb",
  },
};

export default nextConfig;
