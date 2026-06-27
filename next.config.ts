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
          // HSTS: harmless on plain-HTTP localhost (browsers ignore it there),
          // enforced once served over HTTPS in production.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // CSP in REPORT-ONLY first: it logs violations without enforcing, so
          // a too-narrow directive can't blank the app. Confirm the violation
          // reports are clean (recharts inline styles, Supabase avatar/realtime
          // origins) before promoting the key to "Content-Security-Policy".
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "img-src 'self' data: https:",          // avatars (Supabase public bucket) + data URIs
              "style-src 'self' 'unsafe-inline'",      // inline styles / recharts
              "script-src 'self'",                     // tighten after verifying no inline scripts break
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "font-src 'self' data:",
              "frame-ancestors 'none'",                // pairs with X-Frame-Options: DENY
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
