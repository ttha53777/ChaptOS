"use client";

import { useCallback } from "react";
import { useChapter } from "../context/ChapterContext";
import { resolveLabel, type VocabKey, type VocabOverrides } from "@/lib/vocab";

/**
 * Returns a stable `v(key, plural?)` function that resolves a canonical vocab
 * key to the org's configured display label, falling back to the default label
 * when no override is set.
 *
 * Usage:
 *   const v = useVocab();
 *   v("Member")       // → "Brother" (fraternity) or "Member" (club)
 *   v("Member", true) // → "Brothers" or "Members"
 */
export function useVocab() {
  const { currentUser } = useChapter();
  const overrides = (currentUser?.org?.vocabularyOverrides ?? {}) as VocabOverrides;

  return useCallback(
    (key: VocabKey, plural = false): string => resolveLabel(key, overrides, plural),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(overrides)],
  );
}
