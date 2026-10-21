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
 * The org's dashboard layout plus Customize mode's draft of it.
 *
 * While arranging, every change edits a local draft so the page behind it moves
 * live; Done writes the draft to the org (optimistically, rolled back on a
 * failed PATCH). A draft that matches the default is stored as null, so an org
 * that resets is genuinely "never customized" and picks up future defaults.
 */
export function useDashboardLayout() {
  const { currentUser, setDashboardLayoutLocal, setMutationError } = useChapter();
  const stored = currentUser?.org?.dashboardLayout ?? null;
  const saved = useMemo(() => resolveDashboardLayout(stored), [stored]);
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const [saving, setSaving] = useState(false);

  const start = useCallback(() => setDraft(saved), [saved]);
  const update = useCallback((next: DashboardLayout) => setDraft(d => (d ? next : d)), []);
  const reset = useCallback(() => setDraft(d => (d ? DEFAULT_DASHBOARD_LAYOUT : d)), []);

  /** Leave Customize mode, saving the draft. Resolves to what happened. */
  const done = useCallback(async (): Promise<"unchanged" | "saved" | "failed"> => {
    if (!draft) return "unchanged";
    setDraft(null);
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
  }, [draft, saved, stored, setDashboardLayoutLocal, setMutationError]);

  return { layout: draft ?? saved, editing: draft !== null, saving, start, update, reset, done };
}
