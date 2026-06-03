import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tree-shake recharts' barrel import so each chart component pulls only the
  // submodules it uses instead of the whole package. Pure bundling change —
  // the same named exports resolve to the same code, so runtime behavior and
  // chart rendering are identical; only the client bundle shrinks.
  experimental: {
    optimizePackageImports: ["recharts"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
