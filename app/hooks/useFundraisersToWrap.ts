"use client";

import { useMemo } from "react";
import { useChapter } from "../context/ChapterContext";
import { useRollingToday } from "./useRollingToday";

/** Fundraisers whose day has come and nobody has counted yet, for whoever can
 *  wrap them up. /api/auth/me ships candidates cut on the server's date plus a
 *  day of slack; the viewer's own local date makes the final call. */
export function useFundraisersToWrap(): { id: number; name: string; date: string }[] {
  const { currentUser, can } = useChapter();
  const today = useRollingToday();
  const canManage = can("MANAGE_FUNDRAISING");
  const candidates = currentUser?.org?.fundraisersToWrap;
  return useMemo(() => canManage ? (candidates ?? []).filter(f => f.date <= today) : [], [canManage, candidates, today]);
}
