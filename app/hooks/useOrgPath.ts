"use client";

import { useCallback } from "react";
import { useChapter } from "../context/ChapterContext";

/**
 * Prefixes an app path with the active org slug, so links resolve under the
 * org-scoped /[slug] route tree.
 *
 *   const orgPath = useOrgPath();
 *   orgPath("/treasury")  // → "/lpe/treasury"
 *   orgPath("/")          // → "/lpe"
 *
 * Pass paths WITHOUT the slug (e.g. "/treasury", "/"). The hook reads the slug
 * from ChapterContext (currentUser.org.slug). Before the user resolves, there's
 * no slug yet — we return the bare path as a graceful fallback; in practice
 * these links only render inside the [slug] layout where org is already loaded.
 */
export function useOrgPath() {
  const { currentUser } = useChapter();
  const slug = currentUser?.org?.slug ?? null;

  return useCallback(
    (path: string): string => {
      if (!slug) return path; // pre-resolution fallback
      if (path === "/" || path === "") return `/${slug}`;
      const clean = path.startsWith("/") ? path : `/${path}`;
      return `/${slug}${clean}`;
    },
    [slug],
  );
}
