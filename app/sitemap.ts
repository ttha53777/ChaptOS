import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { AUDIENCES } from "./for/content";
import { ARTICLES } from "./help/content";
import { getPosts } from "./blog/posts";

// Public, signed-out-readable pages only (PUBLIC_PATHS in proxy.ts). Preview
// routes such as /seo-preview are left out on purpose.
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${SITE_URL}${path}`;
  return [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/pricing"), changeFrequency: "monthly", priority: 0.9 },
    { url: url("/for"), changeFrequency: "monthly", priority: 0.8 },
    ...AUDIENCES.map(a => ({ url: url(`/for/${a.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: url("/help"), changeFrequency: "weekly", priority: 0.6 },
    ...ARTICLES.map(a => ({ url: url(`/help/${a.slug}`), changeFrequency: "monthly" as const, priority: 0.5 })),
    { url: url("/blog"), changeFrequency: "weekly", priority: 0.6 },
    ...getPosts().map(p => ({ url: url(`/blog/${p.slug}`), lastModified: p.date, priority: 0.5 })),
    { url: url("/trust"), changeFrequency: "monthly", priority: 0.4 },
    { url: url("/contact"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
