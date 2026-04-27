import type { NextConfig } from "next";
import path from "node:path";

const API_HOST = process.env.API_HOST ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingIncludes: {
    "/api/test-print/**": ["./src/lib/test-print/font.ttf"],
  },
  async rewrites() {
    return [
      {
        source: "/api/py/:path*",
        destination: `${API_HOST}/:path*`,
      },
    ];
  },
};

export default nextConfig;
