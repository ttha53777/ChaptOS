"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../context/ChapterContext";
import { requestJson } from "../../../lib/api";
import { NAV, NAV_WORKFLOW_MAP, NAV_DESCRIPTIONS } from "../../../components/Sidebar";
import { ALWAYS_ON_WORKFLOWS, type WorkflowId } from "@/lib/org-types";
import { WORKFLOW_FEATURES, type DisabledFeatures } from "@/lib/workflow-features";
import { NAV_GROUPS, applyNavOrder } from "@/lib/nav-order";
import { isNavVisible } from "../../../components/Sidebar";

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

// Always-on surfaces (Dashboard/Timeline map to null), shown as locked rows so
// admins understand what every org gets regardless of their choices. Chapter is
// now the toggleable "meetings" workflow and renders as a normal page toggle.
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

  // ── Sidebar order (reorder pages within each group, Notion-style) ──────────
  // The persisted navOrder is sparse (see lib/nav-order.ts). We materialize it
  // into a concrete per-group ordering for the editor by running each group's
  // default items through applyNavOrder; the result is the full, explicit list
  // the admin manipulates. On save we flatten every group back into one array.
  const persistedNavOrder = useMemo(
    () => (currentUser?.org?.navOrder ?? []) as string[],
    [currentUser?.org?.navOrder],
  );
  const persistedNavOrderKey = useMemo(() => persistedNavOrder.join("|"), [persistedNavOrder]);

  // Working order, keyed by group label → ordered nav labels.
  const seedOrder = useCallback(
    () => new Map(NAV_GROUPS.map((g) => [g.label, applyNavOrder(g.items, persistedNavOrder)])),
    [persistedNavOrder],
  );
  const [order, setOrder] = useState<Map<string, string[]>>(seedOrder);

  // Re-seed the working order when the stored order changes (post-save
  // normalization, or another admin reordering in a different tab). Same pattern
  // as the workflow/feature re-seeds above.
  const lastSyncedNavKey = useRef(persistedNavOrderKey);
  useEffect(() => {
    if (lastSyncedNavKey.current === persistedNavOrderKey) return;
    lastSyncedNavKey.current = persistedNavOrderKey;
    setOrder(seedOrder());
  }, [persistedNavOrderKey, seedOrder]);

  // The flattened working order, for diffing and saving.
  const flatOrder = useMemo(
    () => NAV_GROUPS.flatMap((g) => order.get(g.label) ?? g.items),
    [order],
  );
  // Dirty when the displayed order differs from the persisted order, resolved
  // through the same applyNavOrder lens so a no-op (persisted is sparse, ours is
  // explicit but equivalent) doesn't read as dirty.
  const navDirty = useMemo(() => {
    const persistedFlat = NAV_GROUPS.flatMap((g) => applyNavOrder(g.items, persistedNavOrder));
    return persistedFlat.join("|") !== flatOrder.join("|");
  }, [flatOrder, persistedNavOrder]);

  // Move a label up/down within its group. Within-group only — moving across the
  // Overview/Members/Operations headings would fight the sidebar's grouping.
  function moveItem(groupLabel: string, index: number, dir: -1 | 1) {
    setOrder((prev) => {
      const next = new Map(prev);
      const items = [...(next.get(groupLabel) ?? [])];
      const target = index + dir;
      if (target < 0 || target >= items.length) return prev;
      [items[index], items[target]] = [items[target], items[index]];
      next.set(groupLabel, items);
      return next;
    });
  }

  // Which labels are visible in the org's current setup — hidden pages still
  // appear in the reorder list (dimmed) so their slot is preserved, matching the
  // sparse-order contract.
  const enabled = useMemo(
    () => new Set(NAV.filter((label) => isNavVisible(label, [...persisted]))),
    [persisted],
  );

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
    if (navDirty) return true;
    return false;
  }, [selected, persisted, disabled, persistedDisabledKey, navDirty]);

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
    setOrder(seedOrder());
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
      // All fields go in one PATCH so a combined edit (page + section toggles +
      // reorder) applies atomically and only triggers one /me refresh. navOrder
      // is sent only when the order actually changed, so a pages-only edit never
      // rewrites the order column. We send the FULL flattened order (the service
      // stores it sparse-or-not; applyNavOrder makes an explicit list harmless).
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabledWorkflows: [...chosen],
          disabledFeatures,
          ...(navDirty ? { navOrder: flatOrder } : {}),
        }),
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
  }, [saving, selected, persisted, disabled, navDirty, flatOrder, refreshChapterData, onStatus, onError]);

  // Renders the indented feature checkboxes for one workflow. Shared by the
  // always-on Dashboard group and the per-page nested groups.
  function renderFeatureGroup(workflow: WorkflowId) {
    const features = WORKFLOW_FEATURES[workflow];
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
      <p className="sc-lede">
        Choose which pages this organization shows in the sidebar, and which
        sections appear within a page. Turning a page or section off just hides
        it — your data is kept and comes back exactly as it was when you turn it
        on again.
      </p>

      {/* Always-on surfaces — locked */}
      <div>
        <p className="sc-grp-label">Always included</p>
        <p className="sc-note" style={{ margin: "-4px 0 9px 2px" }}>Every organization gets these.</p>
        <div className="sc-card sc-card-pad">
          {ALWAYS_ON_LABELS.map((label) => (
            <div key={label} className="sc-row sc-row-between">
              <span className="sc-row-key">{label}</span>
              <span className="sc-locked">Locked</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dashboard widgets — features of the always-on "operations" workflow.
          The Dashboard can't be turned off, but its sections can. */}
      {DASHBOARD_FEATURES.length > 0 && (
        <div>
          <p className="sc-grp-label">Dashboard widgets</p>
          <p className="sc-note" style={{ margin: "-4px 0 9px 2px" }}>Unselected widgets are hidden from the dashboard.</p>
          <div className="sc-card" style={{ padding: "8px 8px" }}>
            {renderFeatureGroup("operations")}
          </div>
        </div>
      )}

      {/* Toggleable pages */}
      <fieldset className="m-0 border-0 p-0">
        <legend className="sc-grp-label p-0">Optional pages</legend>
        <p className="sc-note" style={{ margin: "-4px 0 9px 2px" }}>Unselected pages are hidden from the sidebar.</p>
        <div className="space-y-2">
          {PICKER_ITEMS.map((item) => {
            const on = selected.has(item.workflow);
            const hasFeatures = WORKFLOW_FEATURES[item.workflow].length > 0;
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
                    <div className="sc-check-key">{item.label}</div>
                    <div className="sc-check-sub">{item.description}</div>
                  </div>
                </label>
                {/* Section toggles for this page — only while the page is enabled. */}
                {on && hasFeatures && renderFeatureGroup(item.workflow)}
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
        <p className="sc-grp-label">Sidebar order</p>
        <p className="sc-note" style={{ margin: "-4px 0 9px 2px" }}>
          Arrange pages within each section. This is the order everyone in the
          organization sees in the sidebar.
        </p>
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
                          {label}
                          {off && <span className="sc-reorder-hidden">Hidden</span>}
                        </span>
                        <div className="sc-reorder-btns">
                          <button
                            type="button"
                            className="sc-iconbtn"
                            onClick={() => moveItem(group.label, i, -1)}
                            disabled={i === 0 || saving}
                            aria-label={`Move ${label} up`}
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
                            aria-label={`Move ${label} down`}
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
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={reset} disabled={!dirty || saving} className="sc-btn sc-btn-ghost">
          Reset
        </button>
        {dirty && <span className="sc-dirty">Unsaved</span>}
      </div>
    </div>
  );
}
