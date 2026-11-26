"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../../context/ChapterContext";
import { requestJson } from "../../../../lib/api";
import type { WorkflowId } from "@/lib/org-types";
import type { DisabledFeatures } from "@/lib/workflow-features";
import { NAV_GROUPS } from "@/lib/nav-order";
import {
  ALWAYS_ON_LABELS, DASHBOARD_FEATURES, DUES_FEATURE, PICKER_ITEMS, WORKFLOWS_COPY as C,
  cloneDisabled, disabledMapKey, disabledMapOf, enabledLabels, featureOn as isFeatureOn, featuresOf,
  hasFeatures, moveItem as moveIn, navDirty as orderDirty, navDisplayName, saveErrorOf, seedOrder as seedFrom,
  toggleFeature as toggledFeature, toggleWorkflow, workflowsDirty, workflowsPatch,
} from "@/lib/settings/workflows";
import { useDirtyGuard } from "../SettingsDirtyContext";
import { PaperIcon } from "../../../../components/paper/PaperIcon";
import { useVocab } from "../../../../hooks/useVocab";
import "./workflows.css";

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

// The page list, the locked rows, the Dashboard and Dues switches, the order
// editor's rules and every sentence live in lib/settings/workflows.ts (the app
// renders the same section from it).

export function WorkflowsSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, refreshChapterData } = useChapter();
  const v = useVocab();

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
  const persistedDisabled = useMemo(
    () => disabledMapOf((currentUser?.org?.disabledFeatures ?? {}) as DisabledFeatures),
    [currentUser?.org?.disabledFeatures],
  );

  const persistedDisabledKey = useMemo(() => disabledMapKey(persistedDisabled), [persistedDisabled]);

  const [disabled, setDisabled] = useState<Map<WorkflowId, Set<string>>>(() => cloneDisabled(persistedDisabled));

  // Re-seed the feature toggles when the stored map changes (same rationale as the
  // workflow re-seed above: post-save normalization + cross-tab edits).
  const lastSyncedDisabledKey = useRef(persistedDisabledKey);
  useEffect(() => {
    if (lastSyncedDisabledKey.current === persistedDisabledKey) return;
    lastSyncedDisabledKey.current = persistedDisabledKey;
    setDisabled(cloneDisabled(persistedDisabled));
  }, [persistedDisabledKey, persistedDisabled]);

  // ── Sidebar order (reorder pages within each group, Notion-style) ──────────
  // The persisted navOrder is sparse (see lib/nav-order.ts); seedOrder makes it a
  // concrete per-group list for the editor, and the save flattens it back.
  const persistedNavOrder = useMemo(
    () => (currentUser?.org?.navOrder ?? []) as string[],
    [currentUser?.org?.navOrder],
  );
  const persistedNavOrderKey = useMemo(() => persistedNavOrder.join("|"), [persistedNavOrder]);

  // Working order, keyed by group label → ordered nav labels.
  const seedOrder = useCallback(() => seedFrom(persistedNavOrder), [persistedNavOrder]);
  const [order, setOrder] = useState<Map<string, string[]>>(seedOrder);

  // Re-seed the working order when the stored order changes (post-save
  // normalization, or another admin reordering in a different tab).
  const lastSyncedNavKey = useRef(persistedNavOrderKey);
  useEffect(() => {
    if (lastSyncedNavKey.current === persistedNavOrderKey) return;
    lastSyncedNavKey.current = persistedNavOrderKey;
    setOrder(seedOrder());
  }, [persistedNavOrderKey, seedOrder]);

  const navDirty = useMemo(() => orderDirty(order, persistedNavOrder), [order, persistedNavOrder]);

  // Move a label up/down within its group. Within-group only — moving across the
  // Overview/Members/Operations headings would fight the sidebar's grouping.
  function moveItem(groupLabel: string, index: number, dir: -1 | 1) {
    setOrder((prev) => moveIn(prev, groupLabel, index, dir));
  }

  // Which labels are visible in the org's current setup — hidden pages still
  // appear in the reorder list (dimmed) so their slot is preserved.
  const enabled = useMemo(() => enabledLabels(persisted), [persisted]);

  const dirty = useMemo(
    () => workflowsDirty({ selected, persisted, disabled, persistedDisabledKey, navDirty }),
    [selected, persisted, disabled, persistedDisabledKey, navDirty],
  );
  useDirtyGuard("workflows", dirty);

  const featureOn = (workflow: WorkflowId, id: string) => isFeatureOn(disabled, workflow, id);

  const duesOn = featureOn("operations", DUES_FEATURE);
  const duesTitle = C.duesTitle(v("Dues"));

  function toggleFeature(workflow: WorkflowId, id: string) {
    setDisabled((prev) => toggledFeature(prev, workflow, id));
  }

  function toggle(workflow: WorkflowId) {
    setSelected((prev) => toggleWorkflow(prev, workflow));
  }

  function reset() {
    setSelected(new Set(persisted));
    setDisabled(cloneDisabled(persistedDisabled));
    setOrder(seedOrder());
  }

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // One PATCH (see workflowsPatch): enabledWorkflows carries what this section
      // doesn't own, navOrder only when it changed. Then /me, so the sidebar and
      // page sections reflect it without a reload.
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowsPatch({ persisted, selected, disabled, order, navDirty })),
      });
      await refreshChapterData().catch(() => undefined);
      onStatus(C.saved);
    } catch (e) {
      onError(saveErrorOf(e instanceof Error ? e.message : "", C.forbidden));
    } finally {
      setSaving(false);
    }
  }, [saving, selected, persisted, disabled, navDirty, order, refreshChapterData, onStatus, onError]);

  // Renders the indented feature checkboxes for one workflow. Shared by the
  // always-on Dashboard group and the per-page nested groups.
  function renderFeatureGroup(workflow: WorkflowId) {
    const features = featuresOf(workflow);
    if (!features.length) return null;
    return (
      <div className="sc-pick-features space-y-1">
        {features.map((f) => {
          const on = featureOn(workflow, f.id);
          return (
            <label key={f.id} className="sc-check">
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggleFeature(workflow, f.id)}
              />
              <span aria-hidden className="sc-box">
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="sc-check-key">{f.label}</div>
                <div className="sc-check-sub">{f.description}</div>
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className="sc-stack-tight">
      <p className="sc-lede">{C.lede}</p>

      {/* Always-on surfaces — locked */}
      <div>
        <p className="sc-grp-label">{C.alwaysIncluded}</p>
        <p className="sc-note" style={{ margin: "-4px 0 9px 2px" }}>{C.alwaysNote}</p>
        <div className="sc-card sc-card-pad">
          {ALWAYS_ON_LABELS.map((label) => (
            <div key={label} className="sc-row sc-row-between">
              <span className="sc-row-key">{label}</span>
              <span className="sc-locked">{C.locked}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dues — one switch for the whole feature. */}
      <div>
        <p className="sc-grp-label">{v("Dues")}</p>
        <div className={`wf-dues${duesOn ? " on" : ""}`}>
          <span className="wf-dues-tile" aria-hidden><PaperIcon name="jar" /></span>
          <span className="wf-dues-tx">
            <b>{duesTitle[0]}{duesTitle[1]}</b>
            <small>
              {C.duesSub(duesOn, { dues: v("Dues"), members: v("Member", true), treasury: v("Treasury") })}
            </small>
          </span>
          <button
            type="button"
            role="switch"
            className="wf-switch"
            aria-checked={duesOn}
            aria-label={C.duesLabel(v("Dues"))}
            disabled={saving}
            onClick={() => toggleFeature("operations", DUES_FEATURE)}
          />
        </div>
      </div>

      {/* Dashboard widgets — features of the always-on "operations" workflow.
          The Dashboard can't be turned off, but its sections can. */}
      {DASHBOARD_FEATURES.length > 0 && (
        <div>
          <p className="sc-grp-label">{C.dashboardWidgets}</p>
          <p className="sc-note" style={{ margin: "-4px 0 9px 2px" }}>{C.dashboardNote}</p>
          <div className="sc-card" style={{ padding: "8px 8px" }}>
            {renderFeatureGroup("operations")}
          </div>
        </div>
      )}

      {/* Toggleable pages */}
      <fieldset className="m-0 border-0 p-0">
        <legend className="sc-grp-label p-0">{C.optionalPages}</legend>
        <p className="sc-note" style={{ margin: "-4px 0 9px 2px" }}>{C.optionalNote}</p>
        <div className="space-y-2">
          {PICKER_ITEMS.map((item) => {
            const on = selected.has(item.workflow);
            return (
              <div key={item.workflow} className={`sc-pick${on ? " on" : ""}`}>
                <label className="sc-check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(item.workflow)}
                  />
                  <span aria-hidden className="sc-box">
                    <svg viewBox="0 0 16 16" fill="currentColor">
                      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="sc-check-key">{navDisplayName(item.label)}</div>
                    <div className="sc-check-sub">{item.description}</div>
                  </div>
                </label>
                {/* Section toggles for this page — only while the page is enabled. */}
                {on && hasFeatures(item.workflow) && renderFeatureGroup(item.workflow)}
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* Sidebar order — reorder pages within each group (Notion-style up/down).
          Hidden pages stay in the list (dimmed) so their slot is preserved and
          re-enabling lands them back where they were. Cross-group moves aren't
          offered — that would fight the sidebar's group headings. */}
      <div>
        <p className="sc-grp-label">{C.sidebarOrder}</p>
        <p className="sc-note" style={{ margin: "-4px 0 9px 2px" }}>{C.orderNote}</p>
        <div className="space-y-4">
          {NAV_GROUPS.map((group) => {
            const items = order.get(group.label) ?? group.items;
            return (
              <div key={group.label}>
                <p className="sc-note" style={{ margin: "0 0 5px 2px", fontWeight: 600 }}>{group.label}</p>
                <div className="sc-card sc-card-pad sc-reorder">
                  {items.map((label, i) => {
                    const off = !enabled.has(label);
                    return (
                      <div key={label} className="sc-row sc-row-between">
                        <span className={`sc-row-key${off ? " is-off" : ""}`}>
                          {navDisplayName(label)}
                          {off && <span className="sc-reorder-hidden">{C.hidden}</span>}
                        </span>
                        <div className="sc-reorder-btns">
                          <button
                            type="button"
                            className="sc-iconbtn"
                            onClick={() => moveItem(group.label, i, -1)}
                            disabled={i === 0 || saving}
                            aria-label={C.moveUp(label)}
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12V4M4 8l4-4 4 4" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="sc-iconbtn"
                            onClick={() => moveItem(group.label, i, 1)}
                            disabled={i === items.length - 1 || saving}
                            aria-label={C.moveDown(label)}
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 4v8M4 8l4 4 4-4" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sc-actions">
        <button onClick={save} disabled={!dirty || saving} className="sc-btn sc-btn-primary">
          {saving ? C.saving : C.save}
        </button>
        <button onClick={reset} disabled={!dirty || saving} className="sc-btn sc-btn-ghost">
          {C.reset}
        </button>
        {dirty && <span className="sc-dirty">{C.unsaved}</span>}
      </div>
    </div>
  );
}
