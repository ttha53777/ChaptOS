"use client";

import { useCallback, useMemo, useState } from "react";
import { useChapter } from "../../../context/ChapterContext";
import { requestJson } from "../../../lib/api";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  resolveDashboardLayout,
  sameDashboardLayout,
  type DashboardLayout,
} from "@/lib/dashboard-layout";

/**
 * The org's dashboard layout plus Arrange mode's draft of it.
 *
 * While arranging, every change edits a local draft so the page behind it moves
 * live, and each one is a step Undo can take back. Done writes the draft to the
 * org (optimistically, rolled back on a failed PATCH). A draft that matches the
 * default is stored as null, so an org that resets is genuinely "never
 * customized" and picks up future defaults.
 */
export function useDashboardLayout() {
  const { currentUser, setDashboardLayoutLocal, setMutationError } = useChapter();
  const stored = currentUser?.org?.dashboardLayout ?? null;
  const saved = useMemo(() => resolveDashboardLayout(stored), [stored]);
  const [edit, setEdit] = useState<{ draft: DashboardLayout; past: DashboardLayout[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const start = useCallback(() => setEdit({ draft: saved, past: [] }), [saved]);
  const update = useCallback((next: DashboardLayout) => setEdit(e => (
    e && next !== e.draft && !sameDashboardLayout(next, e.draft) ? { draft: next, past: [...e.past, e.draft] } : e
  )), []);
  const undo = useCallback(() => setEdit(e => (
    e && e.past.length ? { draft: e.past[e.past.length - 1], past: e.past.slice(0, -1) } : e
  )), []);

  /** Leave Arrange mode, saving the draft. Resolves to what happened. */
  const done = useCallback(async (): Promise<"unchanged" | "saved" | "failed"> => {
    const draft = edit?.draft;
    if (!draft) return "unchanged";
    setEdit(null);
    if (sameDashboardLayout(draft, saved)) return "unchanged";
    const next = sameDashboardLayout(draft, DEFAULT_DASHBOARD_LAYOUT) ? null : draft;
    setDashboardLayoutLocal(next);
    setSaving(true);
    try {
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboardLayout: next }),
      });
      return "saved";
    } catch {
      setDashboardLayoutLocal(stored);
      setMutationError("Couldn't save the dashboard layout. Try again.");
      return "failed";
    } finally {
      setSaving(false);
    }
  }, [edit, saved, stored, setDashboardLayoutLocal, setMutationError]);

  return {
    layout: edit?.draft ?? saved,
    editing: edit !== null,
    canUndo: !!edit?.past.length,
    saving,
    start,
    update,
    undo,
    done,
  };
}
