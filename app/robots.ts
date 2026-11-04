import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Org workspaces bounce signed-out crawlers to /login anyway; now that they all
// share /org/ they're listed too, so crawlers stop spending requests on them.
// /seo-preview is
// deliberately NOT disallowed: it carries `noindex`, and a crawler blocked by
// robots.txt never gets to read that tag.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/auth/", "/join/", "/welcome", "/login", "/org/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
