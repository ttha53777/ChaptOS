"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../context/ChapterContext";
import { requestJson } from "../../../lib/api";
import { NAV, NAV_WORKFLOW_MAP, NAV_DESCRIPTIONS } from "../../../components/Sidebar";
import { ALWAYS_ON_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { WORKFLOW_FEATURES, type DisabledFeatures } from "@/lib/workflow-features";

// Settings → Workflows. Lets an org admin choose which optional pages the org
// exposes, AND which sections within a page are shown, at any time after
// creation. This is the in-app counterpart to the one-time post-creation picker
// at /[slug]/onboarding — same underlying service (setWorkflows /
// setDisabledFeatures) and route (PATCH /api/orgs/config), same NAV-derived
// toggle list, just styled like the other settings sections.
//
// Both kinds of toggle are a VISIBILITY change only. Disabling a page rewrites
// the org's enabledWorkflows set (drives the sidebar); hiding a section rewrites
// disabledFeatures (drives the page's own rendering). Neither touches domain data
// — a page/section's members/transactions/docs/etc. are kept and reappear
// unchanged when turned back on. We never delete or cascade anything here.
//
// Feature toggles are OPT-OUT: the persisted disabledFeatures map records only
// the sections turned OFF. We mirror that in local state (a per-workflow set of
// disabled ids) so the wire format and the UI never drift.

interface PickerItem {
  label: string;
  workflow: WorkflowId;
  description: string;
}

// One toggle row per hideable nav surface — every NAV label whose workflow is
// non-null in NAV_WORKFLOW_MAP. Derived from NAV so this list can never drift
// from the sidebar's actual surfaces (shared with the onboarding picker).
const PICKER_ITEMS: PickerItem[] = NAV.flatMap((label) => {
  const workflow = NAV_WORKFLOW_MAP[label];
  if (workflow == null) return []; // always-on surface — not a toggle
  return [{ label, workflow, description: NAV_DESCRIPTIONS[label] ?? "" }];
});

// The workflows this section can actually toggle. Anything in the org's enabled
// set that ISN'T here (e.g. "attendance", "events" — real workflows with no
// top-level nav surface) must be preserved verbatim on save; this section only
// owns the nav-mapped ones. See the save handler.
const TOGGLEABLE_WORKFLOWS = new Set<WorkflowId>(PICKER_ITEMS.map((i) => i.workflow));

// Always-on surfaces (Dashboard/Timeline/Chapter map to null), shown as locked
// rows so admins understand what every org gets regardless of their choices.
const ALWAYS_ON_LABELS = NAV.filter((label) => NAV_WORKFLOW_MAP[label] == null);

// Dashboard widgets live under the always-on "operations" workflow. The page
// can't be turned off, but its widgets can — so we surface that feature group on
// its own (it has no toggleable PICKER_ITEMS row to nest under). Other workflows'
// features nest under their page toggle (rendered only when that page is enabled).
const DASHBOARD_FEATURES = WORKFLOW_FEATURES.operations;

// A stable, order-independent content key for a disabled-features map, used to
// re-seed local state only when the *stored* map actually changes (not on every
// /me refresh, which recreates an equal object).
function disabledKey(map: DisabledFeatures): string {
  return Object.keys(map)
    .sort()
    .map((w) => `${w}:${[...(map[w as WorkflowId] ?? [])].sort().join("|")}`)
    .join(",");
}

export function WorkflowsSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, refreshChapterData } = useChapter();

  // The org's persisted set is the source of truth. We compare against it to
  // derive `dirty` and to reset, so the section always reflects what's saved.
  const persisted = useMemo(
    () => new Set<WorkflowId>((currentUser?.org?.enabledWorkflows ?? []) as WorkflowId[]),
    [currentUser?.org?.enabledWorkflows],
  );

  // A content key for the persisted set (order-independent). Used to re-sync the
  // local selection only when the *stored* set actually changes — not on every
  // /me refresh, which recreates the `persisted` Set with the same contents.
  const persistedKey = useMemo(() => [...persisted].sort().join(","), [persisted]);

  const [selected, setSelected] = useState<Set<WorkflowId>>(() => new Set(persisted));
  const [saving, setSaving] = useState(false);

  // Re-seed the toggles whenever the stored set changes: after our own save (the
  // service normalizes the set — force-enables always-on ids, drops unknowns — so
  // the authoritative result may differ from what we optimistically picked), and
  // if another admin changes it in a different tab/session. Keyed on content so
  // unrelated context refreshes don't clobber an in-progress edit. The initial
  // mount already seeds via useState, so the first run here is a harmless no-op.
  const lastSyncedKey = useRef(persistedKey);
  useEffect(() => {
    if (lastSyncedKey.current === persistedKey) return;
    lastSyncedKey.current = persistedKey;
    setSelected(new Set(persisted));
  }, [persistedKey, persisted]);

  // ── Feature toggles (OPT-OUT: we track the DISABLED ids) ──────────────────
  // The persisted map is the source of truth. Mirror it as Map<workflow, Set<id>>
  // for ergonomic per-feature toggling; absent workflow / id means "enabled".
  const persistedDisabled = useMemo(() => {
    const raw = (currentUser?.org?.disabledFeatures ?? {}) as DisabledFeatures;
    const map = new Map<WorkflowId, Set<string>>();
    for (const [w, ids] of Object.entries(raw)) {
      if (ids && ids.length) map.set(w as WorkflowId, new Set(ids));
    }
    return map;
  }, [currentUser?.org?.disabledFeatures]);

  const persistedDisabledKey = useMemo(
    () => disabledKey(Object.fromEntries([...persistedDisabled].map(([w, s]) => [w, [...s]])) as DisabledFeatures),
    [persistedDisabled],
  );

  const [disabled, setDisabled] = useState<Map<WorkflowId, Set<string>>>(
    () => new Map([...persistedDisabled].map(([w, s]) => [w, new Set(s)])),
  );

  // Re-seed the feature toggles when the stored map changes (same rationale as the
  // workflow re-seed above: post-save normalization + cross-tab edits).
  const lastSyncedDisabledKey = useRef(persistedDisabledKey);
  useEffect(() => {
    if (lastSyncedDisabledKey.current === persistedDisabledKey) return;
    lastSyncedDisabledKey.current = persistedDisabledKey;
    setDisabled(new Map([...persistedDisabled].map(([w, s]) => [w, new Set(s)])));
  }, [persistedDisabledKey, persistedDisabled]);

  // Dirty = the optional page picks OR the feature picks differ from persisted.
  // Always-on workflow ids are forced on by the service either way, so we don't
  // diff them; disabled-feature ids are diffed via the content key.
  const dirty = useMemo(() => {
    for (const { workflow } of PICKER_ITEMS) {
      if (selected.has(workflow) !== persisted.has(workflow)) return true;
    }
    const currentDisabledKey = disabledKey(
      Object.fromEntries([...disabled].map(([w, s]) => [w, [...s]])) as DisabledFeatures,
    );
    if (currentDisabledKey !== persistedDisabledKey) return true;
    return false;
  }, [selected, persisted, disabled, persistedDisabledKey]);

  // A feature is ON when it's NOT in the workflow's disabled set.
  function featureOn(workflow: WorkflowId, id: string): boolean {
    return !disabled.get(workflow)?.has(id);
  }

  function toggleFeature(workflow: WorkflowId, id: string) {
    setDisabled((prev) => {
      const next = new Map([...prev].map(([w, s]) => [w, new Set(s)]));
      const set = next.get(workflow) ?? new Set<string>();
      if (set.has(id)) set.delete(id);
      else set.add(id);
      if (set.size) next.set(workflow, set);
      else next.delete(workflow);
      return next;
    });
  }

  function toggle(workflow: WorkflowId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workflow)) next.delete(workflow);
      else next.add(workflow);
      return next;
    });
  }

  function reset() {
    setSelected(new Set(persisted));
    setDisabled(new Map([...persistedDisabled].map(([w, s]) => [w, new Set(s)])));
  }

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    // Build the full desired set as: everything currently enabled that this
    // section does NOT control (e.g. "attendance"/"events" — workflows with no
    // nav toggle), plus this section's selected toggles, plus the always-on ids.
    //
    // Critically we do NOT reconstruct the set from the toggles alone — that
    // would silently drop any enabled workflow without a picker row. PATCH is a
    // full replace, so carrying those through is what keeps "disabling a page"
    // from quietly turning off unrelated functionality. The service de-dupes and
    // force-enables the always-on ids regardless; we send them for idempotence.
    const chosen = new Set<WorkflowId>([
      ...[...persisted].filter((w) => !TOGGLEABLE_WORKFLOWS.has(w)),
      ...PICKER_ITEMS.filter((i) => selected.has(i.workflow)).map((i) => i.workflow),
      ...ALWAYS_ON_WORKFLOWS,
    ]);

    // The disabled-features map — only non-empty sets. The service normalizes
    // (drops unknown ids/workflows), so sending the raw working state is safe.
    const disabledFeatures: DisabledFeatures = {};
    for (const [w, s] of disabled) {
      if (s.size) disabledFeatures[w] = [...s];
    }

    try {
      // Both fields go in one PATCH so a combined edit (page + section toggles)
      // applies atomically and only triggers one /me refresh.
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledWorkflows: [...chosen], disabledFeatures }),
      });
      // Re-fetch /me so the sidebar and page sections reflect the new state
      // immediately (no reload).
      await refreshChapterData().catch(() => undefined);
      onStatus("Pages updated.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      onError(
        message.includes("403") || /forbidden/i.test(message)
          ? "Only an org admin can change which pages are enabled."
          : "Couldn't save your changes. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, selected, persisted, disabled, refreshChapterData, onStatus, onError]);

  // Renders the indented feature checkboxes for one workflow. Shared by the
  // always-on Dashboard group and the per-page nested groups.
  function renderFeatureGroup(workflow: WorkflowId) {
    const features = WORKFLOW_FEATURES[workflow];
    if (!features.length) return null;
    return (
      <div className="mt-2 space-y-1.5 border-l border-white/[0.08] pl-4">
        {features.map((f) => {
          const on = featureOn(workflow, f.id);
          return (
            <label
              key={f.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggleFeature(workflow, f.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                  on ? "border-indigo-400 bg-indigo-500 text-white" : "border-white/20 bg-transparent"
                }`}
              >
                {on && (
                  <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-slate-300">{f.label}</div>
                <div className="text-[11px] text-slate-500">{f.description}</div>
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-[12px] text-slate-500">
        Choose which pages this organization shows in the sidebar, and which
        sections appear within a page. Turning a page or section off just hides
        it — your data is kept and comes back exactly as it was when you turn it
        on again.
      </p>

      {/* Always-on surfaces — locked */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Always included</p>
        <p className="mb-2 text-[11px] text-slate-500">Every organization gets these.</p>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4">
          {ALWAYS_ON_LABELS.map((label) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-3 last:border-0"
            >
              <span className="text-[12px] font-medium text-slate-300">{label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Locked</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dashboard widgets — features of the always-on "operations" workflow.
          The Dashboard can't be turned off, but its sections can. */}
      {DASHBOARD_FEATURES.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Dashboard widgets</p>
          <p className="mb-2 text-[11px] text-slate-500">Unselected widgets are hidden from the dashboard.</p>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-2">
            {renderFeatureGroup("operations")}
          </div>
        </div>
      )}

      {/* Toggleable pages */}
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1 p-0 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Optional pages</legend>
        <p className="mb-2 text-[11px] text-slate-500">Unselected pages are hidden from the sidebar.</p>
        <div className="space-y-2">
          {PICKER_ITEMS.map((item) => {
            const on = selected.has(item.workflow);
            const hasFeatures = WORKFLOW_FEATURES[item.workflow].length > 0;
            return (
              <div
                key={item.workflow}
                className={`rounded-xl border px-4 py-3 transition-colors ${
                  on
                    ? "border-indigo-500/30 bg-indigo-500/[0.08]"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(item.workflow)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                      on ? "border-indigo-400 bg-indigo-500 text-white" : "border-white/20 bg-transparent"
                    }`}
                  >
                    {on && (
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-slate-200">{item.label}</div>
                    <div className="text-[11px] text-slate-500">{item.description}</div>
                  </div>
                </label>
                {/* Section toggles for this page — only while the page is enabled. */}
                {on && hasFeatures && renderFeatureGroup(item.workflow)}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white transition-all hover:bg-indigo-500 disabled:cursor-default disabled:opacity-30"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={reset}
          disabled={!dirty || saving}
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-30"
        >
          Reset
        </button>
        {dirty && (
          <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
            Unsaved
          </span>
        )}
      </div>
    </div>
  );
}
