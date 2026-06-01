"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useChapter } from "../context/ChapterContext";

/**
 * Prefixes an app path with the active org slug, so links resolve under the
 * org-scoped /[slug] route tree.
 *
 *   const orgPath = useOrgPath();
 *   orgPath("/treasury")  // → "/lpe/treasury"
 *   orgPath("/")          // → "/lpe"
 *
 * Pass paths WITHOUT the slug (e.g. "/treasury", "/").
 *
 * Slug source, in priority order:
 *   1. ChapterContext (currentUser.org.slug) — authoritative once loaded.
 *   2. The first segment of the current pathname — covers the brief window on
 *      initial mount before /api/auth/me resolves. These links only ever render
 *      inside /[slug]/*, so the URL's own first segment IS the org slug. Without
 *      this, fast clicks during load would hit bare "/treasury" (a 404).
 *
 * If neither yields a slug (e.g. rendered outside any org route), we return the
 * bare path unchanged.
 */
export function useOrgPath() {
  const { currentUser } = useChapter();
  const pathname = usePathname();

  // First path segment, e.g. "/lpe/treasury" → "lpe". Empty at root "/".
  const urlSlug = pathname?.split("/")[1] || null;
  const slug = currentUser?.org?.slug ?? urlSlug;

  return useCallback(
    (path: string): string => {
      if (!slug) return path; // no org context at all — graceful fallback
      if (path === "/" || path === "") return `/${slug}`;
      const clean = path.startsWith("/") ? path : `/${path}`;
      return `/${slug}${clean}`;
    },
    [slug],
  );
}
