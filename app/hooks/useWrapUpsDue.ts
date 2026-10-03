"use client";

import { useMemo } from "react";
import { useChapter } from "../context/ChapterContext";
import { needsWrapUp } from "@/lib/programming";
import { useRollingToday } from "./useRollingToday";

/** One event that happened and hasn't been wrapped up. */
export interface WrapUpDue {
  id: number;
  title: string;
  dueDate: string | null;
}

/**
 * Confirmed events whose date has passed, for anyone who can wrap them up.
 *
 * Two sources, same rule. /api/auth/me ships candidates on every page load so
 * the sidebar dot and the dashboard need no fetch of their own. But /me is read
 * once, so after an officer wraps one up on the events page it would keep
 * pointing at an event that's already Done. Where the events page has loaded the
 * live list into context, that list wins — it's the one being mutated.
 */
export function useWrapUpsDue(): WrapUpDue[] {
  const { currentUser, programmingTaskList, can } = useChapter();
  const today = useRollingToday();
  const canManage = can("MANAGE_EVENTS");
  const candidates = currentUser?.org?.wrapUpsDue;

  return useMemo(() => {
    if (!canManage) return [];
    const source = programmingTaskList.length > 0 ? programmingTaskList : candidates ?? [];
    return source
      .filter(t => needsWrapUp(t, today))
      .map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate }))
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }, [canManage, programmingTaskList, candidates, today]);
}
