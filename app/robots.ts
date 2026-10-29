import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Org workspaces (/<slug>) already bounce signed-out crawlers to /login, so
// only the platform's own non-public prefixes are listed here. /seo-preview is
// deliberately NOT disallowed: it carries `noindex`, and a crawler blocked by
// robots.txt never gets to read that tag.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/auth/", "/join/", "/welcome", "/login"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
