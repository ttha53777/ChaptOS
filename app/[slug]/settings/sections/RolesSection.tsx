"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { PERMISSIONS, PERMISSION_LIST, type Permission } from "@/lib/permissions";
import { requestJson } from "../../../lib/api";
import { useDirtyGuard } from "../SettingsDirtyContext";

interface RoleRow {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  permissions: number;
  isSystem: boolean;
  memberCount: number;
}

interface Draft {
  name: string;
  color: string;
  rank: number;
  permissions: number;
  colorTouched: boolean;
}

const DEFAULT_COLOR = "#5865F2";

// Quick picks for the role chip color. The native picker stays available as
// "custom" for anything else.
const SWATCHES = [
  "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#5865F2",
  "#3B82F6", "#06B6D4", "#10B981", "#84CC16", "#94A3B8",
];

// Human names + one-line descriptions for each bit, grouped by the part of the
// app they unlock. The Record type forces copy for a newly added bit; the
// "Other" group below keeps it on screen if nobody files it into a group.
const PERMISSION_COPY: Record<Permission, { label: string; desc: string }> = {
  MANAGE_BROTHERS:      { label: "Roster",        desc: "Edit member details and dues, approve join requests, remove people." },
  MANAGE_ATTENDANCE:    { label: "Attendance",    desc: "Record attendance and approve excuses." },
  MANAGE_ROLES:         { label: "Roles",         desc: "Create roles and hand out any role ranked below their own." },
  MANAGE_SETTINGS:      { label: "Org settings",  desc: "Change org settings and manage invite links." },
  MANAGE_TREASURY:      { label: "Treasury",      desc: "Record transactions, set budgets, export the books." },
  MANAGE_EVENTS:        { label: "Events",        desc: "Create and edit calendar events." },
  MANAGE_PARTIES:       { label: "Parties",       desc: "Create and manage parties." },
  MANAGE_SERVICE:       { label: "Service",       desc: "Create and manage service events." },
  MANAGE_SEMESTERS:     { label: "Semesters",     desc: "Create and edit semesters." },
  MANAGE_ANNOUNCEMENTS: { label: "Announcement",  desc: "Post and edit the chapter announcement." },
  MANAGE_DOCS:          { label: "Docs",          desc: "Pin, edit and delete shared doc links." },
  MANAGE_TASKS:         { label: "Tasks",         desc: "Create, assign and delete tasks and deadlines." },
  MANAGE_POLLS:         { label: "Polls",         desc: "Create, assign, close and delete polls." },
  MANAGE_INSTAGRAM:     { label: "Instagram",     desc: "Manage Instagram content." },
};

const PERMISSION_GROUPS: { label: string; perms: Permission[] }[] = [
  { label: "People & access", perms: ["MANAGE_BROTHERS", "MANAGE_ATTENDANCE", "MANAGE_ROLES", "MANAGE_SETTINGS"] },
  { label: "Money",           perms: ["MANAGE_TREASURY"] },
  { label: "Calendar",        perms: ["MANAGE_EVENTS", "MANAGE_PARTIES", "MANAGE_SERVICE", "MANAGE_SEMESTERS"] },
  { label: "Communication",   perms: ["MANAGE_ANNOUNCEMENTS", "MANAGE_DOCS", "MANAGE_TASKS", "MANAGE_POLLS", "MANAGE_INSTAGRAM"] },
];
// Any bit not placed in a group above still renders, under "Other".
const UNGROUPED = PERMISSION_LIST.filter(p => !PERMISSION_GROUPS.some(g => g.perms.includes(p.name))).map(p => p.name);
if (UNGROUPED.length) PERMISSION_GROUPS.push({ label: "Other", perms: UNGROUPED });

const ALL_BITS = PERMISSION_LIST.reduce((acc, p) => acc | p.bit, 0);

function permLabel(p: Permission): string {
  return PERMISSION_COPY[p]?.label ?? p.replace(/^MANAGE_/, "").toLowerCase();
}

function heldPermissions(bits: number): Permission[] {
  return PERMISSION_LIST.filter(p => (bits & p.bit) !== 0).map(p => p.name);
}

function permissionSummary(bits: number): string {
  const names = heldPermissions(bits).map(permLabel);
  if (names.length === 0) return "No permissions";
  if (names.length === PERMISSION_LIST.length) return "All permissions";
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
  return names.join(", ");
}

function peopleCount(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

function draftFromRole(role: RoleRow): Draft {
  return {
    name: role.name,
    color: role.color ?? DEFAULT_COLOR,
    rank: role.rank,
    permissions: role.permissions,
    // A persisted null color is "untouched" so saving without picking one keeps
    // it null instead of writing the DEFAULT_COLOR the picker had to display.
    colorTouched: role.color !== null,
  };
}

const BLANK_DRAFT: Draft = { name: "", color: DEFAULT_COLOR, rank: 0, permissions: 0, colorTouched: true };

export function RolesSection({
  onStatus, onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, can } = useChapter();
  const canManageRoles = can("MANAGE_ROLES");
  // Super-admin maxRank is Infinity (normalized in ChapterContext); for non-admins
  // it's the highest role rank they hold. Gates edit/delete on individual rows.
  const myMaxRank = currentUser?.maxRank ?? 0;

  const [roles, setRoles] = useState<RoleRow[]>([]);
  // roleId → holders, inverted from /api/auth/accounts so the editor can show
  // who holds a role without a per-role round trip.
  const [membersByRole, setMembersByRole] = useState<Map<number, { id: number; name: string }[]>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  // Set when save() paused on the "no permissions selected" warning.
  const [confirmNoPerms, setConfirmNoPerms] = useState(false);
  // A selection change held back by unsaved edits, replayed on "Discard".
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, accounts] = await Promise.all([
        requestJson<RoleRow[]>("/api/roles"),
        requestJson<Array<{ id: number; name: string; roles: { id: number }[] }>>("/api/auth/accounts"),
      ]);
      setRoles(rolesData);
      const byRole = new Map<number, { id: number; name: string }[]>();
      for (const a of accounts) {
        for (const r of a.roles) {
          const list = byRole.get(r.id) ?? [];
          list.push({ id: a.id, name: a.name });
          byRole.set(r.id, list);
        }
      }
      for (const list of byRole.values()) list.sort((x, y) => x.name.localeCompare(y.name));
      setMembersByRole(byRole);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load roles.");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { refresh(); }, [refresh]);

  // Load the draft on selection change or entering create mode — NOT on every
  // `roles` update, which would clobber in-progress edits whenever the list
  // refreshes underneath.
  const lastSyncedKey = useRef<string | null>(null);
  useEffect(() => {
    const key = creating ? "new" : selectedId != null ? `id:${selectedId}` : null;
    if (key === null) { lastSyncedKey.current = null; return; }
    if (lastSyncedKey.current === key) return;
    if (creating) {
      setDraft(BLANK_DRAFT);
      lastSyncedKey.current = key;
      return;
    }
    const role = roles.find(r => r.id === selectedId);
    if (role) {
      setDraft(draftFromRole(role));
      lastSyncedKey.current = key;
    }
  }, [selectedId, creating, roles]);

  const selected = useMemo(
    () => (selectedId != null ? roles.find(r => r.id === selectedId) ?? null : null),
    [selectedId, roles],
  );

  const isEditableRow = useCallback(
    (r: RoleRow) => canManageRoles && r.rank < myMaxRank,
    [canManageRoles, myMaxRank],
  );

  const dirty = useMemo(() => {
    if (creating) return draft.name.trim() !== "" || draft.permissions !== 0 || draft.rank !== 0;
    if (!selected || !isEditableRow(selected)) return false;
    return (
      (!selected.isSystem && draft.name.trim() !== selected.name) ||
      (draft.colorTouched && draft.color.toLowerCase() !== (selected.color ?? "").toLowerCase()) ||
      draft.rank !== selected.rank ||
      draft.permissions !== selected.permissions
    );
  }, [creating, draft, selected, isEditableRow]);

  useDirtyGuard("roles", dirty);

  // Every selection change funnels through here so unsaved edits are never
  // dropped silently by clicking another row.
  function guarded(fn: () => void) {
    if (dirty) setPendingSwitch(() => fn);
    else fn();
  }

  function openRole(id: number) {
    guarded(() => {
      setCreating(false);
      setSelectedId(prev => (prev === id ? null : id));
    });
  }

  function startCreate() {
    guarded(() => { setSelectedId(null); setCreating(true); });
  }

  function closeEditor() {
    setCreating(false);
    setSelectedId(null);
  }

  function discard() {
    if (creating) { closeEditor(); return; }
    if (selected) setDraft(draftFromRole(selected));
  }

  // Entry point for Save. A zero-permission role is valid (a pure label) but
  // usually a mistake, so the UI asks first.
  function save() {
    if (!draft.name.trim()) { onError("Give the role a name."); return; }
    if (draft.rank >= myMaxRank) { onError(`Rank must be below your own (max ${myMaxRank - 1}).`); return; }
    if (draft.permissions === 0) { setConfirmNoPerms(true); return; }
    void performSave();
  }

  async function performSave() {
    const name = draft.name.trim();
    // Snapshot intent so a selection change mid-await can't misroute the save.
    const intent: { kind: "create" } | { kind: "update"; target: RoleRow } | null =
      creating ? { kind: "create" } : selected ? { kind: "update", target: selected } : null;
    if (!intent) { onError("Nothing selected to save."); return; }
    const d = draft;

    setSaving(true);
    try {
      if (intent.kind === "create") {
        const created = await requestJson<RoleRow>("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color: d.color, rank: d.rank, permissions: d.permissions }),
        });
        onStatus(`Created role "${created.name}".`);
        lastSyncedKey.current = null;
        setCreating(false);
        await refresh();
        setSelectedId(created.id);
      } else {
        const target = intent.target;
        const payload: Record<string, unknown> = { rank: d.rank, permissions: d.permissions };
        if (d.colorTouched) payload.color = d.color;
        if (!target.isSystem && name !== target.name) payload.name = name;
        await requestJson(`/api/roles/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Patch locally — edits don't change the row set, and a refetch flickers
        // the open row.
        const newName = !target.isSystem ? name : target.name;
        const newColor = d.colorTouched ? d.color : target.color;
        setRoles(prev => prev.map(r => r.id === target.id ? {
          ...r, name: newName, color: newColor, rank: d.rank, permissions: d.permissions,
        } : r));
        setDraft(prev => ({ ...prev, name: newName }));
        onStatus(`Saved "${newName}".`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save role.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(role: RoleRow) {
    setSaving(true);
    try {
      await requestJson(`/api/roles/${role.id}`, { method: "DELETE" });
      onStatus(`Deleted role "${role.name}".`);
      if (selectedId === role.id) setSelectedId(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete role.");
    } finally {
      setSaving(false);
      setDeleteTarget(null);
    }
  }

  // Defense-in-depth: the settings nav already hides this section without
  // MANAGE_ROLES; render nothing if a stale session lands here anyway.
  if (!canManageRoles) return null;

  const editorProps = {
    draft, setDraft, roles, myMaxRank, saving, dirty,
    onSave: save, onDiscard: discard,
  };

  return (
    <div className="sc-stack-tight">
      <div className="rl-bar">
        <p className="sc-note">
          One person can hold several roles; their access is everything those roles grant combined.
          Org admins have full access regardless of roles.
        </p>
        <button onClick={startCreate} disabled={creating} className="sc-btn sc-btn-primary sc-btn-sm shrink-0">
          + New role
        </button>
      </div>

      {loading && roles.length === 0 ? (
        <p className="sc-note">Loading roles…</p>
      ) : (
        <ul className="sc-card rl-list">
          {creating && (
            <li className="rl-item open">
              <div className="rl-head rl-head-static">
                <span className="rl-dot" style={{ background: draft.color }} aria-hidden="true" />
                <span className="rl-head-main">
                  <span className="rl-name">{draft.name.trim() || "New role"}</span>
                </span>
              </div>
              <RoleEditor {...editorProps} mode="create" onCancel={() => guarded(closeEditor)} />
            </li>
          )}

          {roles.map((r) => {
            const editable = isEditableRow(r);
            const open = !creating && selectedId === r.id;
            const holders = membersByRole.get(r.id) ?? [];
            return (
              <li key={r.id} className={`rl-item${open ? " open" : ""}`} style={{ "--rl-c": r.color ?? "var(--muted)" } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => openRole(r.id)}
                  aria-expanded={open}
                  aria-controls={`role-editor-${r.id}`}
                  className="rl-head"
                >
                  <span className="rl-dot" aria-hidden="true" />
                  <span className="rl-head-main">
                    <span className="rl-title">
                      <span className="rl-name truncate">{r.name}</span>
                      {r.isSystem && <span className="sc-pill sc-pill-muted">System</span>}
                      {!editable && (
                        <span className="rl-locked" title="Ranked at or above your own role — view only">
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                            <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                            <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
                          </svg>
                          View only
                        </span>
                      )}
                    </span>
                    <span className="rl-sub">
                      {permissionSummary(r.permissions)}
                    </span>
                  </span>
                  <span className="rl-meta">
                    <span>{peopleCount(r.memberCount)}</span>
                    <span className="rl-meta-rank">Rank {r.rank}</span>
                  </span>
                  <svg className="rl-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                {open && (
                  <div id={`role-editor-${r.id}`}>
                    <RoleEditor
                      {...editorProps}
                      mode={editable ? "edit" : "view"}
                      role={r}
                      holders={holders}
                      onCancel={() => guarded(closeEditor)}
                      onDelete={!r.isSystem && editable ? () => setDeleteTarget(r) : undefined}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirmNoPerms && (
        <ConfirmDialog
          title="Save a role with no permissions?"
          message={
            <>
              <span className="font-semibold" style={{ color: "var(--ink)" }}>{draft.name.trim()}</span> has
              nothing selected, so holding it grants no extra access. That&apos;s fine if you want the role
              purely as a label — otherwise pick some permissions first.
            </>
          }
          confirmLabel="Save anyway"
          tone="dusk"
          onConfirm={() => { setConfirmNoPerms(false); void performSave(); }}
          onCancel={() => setConfirmNoPerms(false)}
        />
      )}

      {pendingSwitch && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message={`Your edits to "${creating ? draft.name.trim() || "New role" : selected?.name ?? "this role"}" haven't been saved.`}
          confirmLabel="Discard"
          tone="dusk"
          onConfirm={() => {
            const fn = pendingSwitch;
            setPendingSwitch(null);
            // Reset first so the dirty guard doesn't re-intercept the replay.
            if (selected) setDraft(draftFromRole(selected));
            lastSyncedKey.current = null;
            fn();
          }}
          onCancel={() => setPendingSwitch(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete role "${deleteTarget.name}"?`}
          message={
            deleteTarget.memberCount > 0
              ? `This will remove the role from ${peopleCount(deleteTarget.memberCount)}. This cannot be undone.`
              : "This cannot be undone."
          }
          confirmLabel="Delete"
          tone="dusk"
          onConfirm={() => doDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function RoleEditor({
  mode, role, holders, draft, setDraft, roles, myMaxRank, saving, dirty,
  onSave, onDiscard, onCancel, onDelete,
}: {
  mode: "create" | "edit" | "view";
  role?: RoleRow;
  holders?: { id: number; name: string }[];
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  roles: RoleRow[];
  myMaxRank: number;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const readOnly = mode === "view";
  // In view mode show the persisted role, not a draft the user can't save.
  const shown = readOnly && role ? draftFromRole(role) : draft;
  const nameLocked = readOnly || (mode === "edit" && !!role?.isSystem);

  const rankCapped = Number.isFinite(myMaxRank);
  const rankInvalid = !readOnly && rankCapped && draft.rank >= myMaxRank;

  // Where this rank sits among the other roles — a bare number means nothing
  // until you can see what it lands above and below.
  const others = roles.filter(r => r.id !== role?.id);
  const above = others.filter(r => r.rank > shown.rank).sort((a, b) => a.rank - b.rank)[0];
  const below = others.filter(r => r.rank < shown.rank).sort((a, b) => b.rank - a.rank)[0];
  const tied = others.filter(r => r.rank === shown.rank).map(r => r.name);
  const placement = [
    below && `above ${below.name}`,
    tied.length > 0 && `level with ${tied.join(", ")}`,
    above && `below ${above.name}`,
  ].filter(Boolean).join(" · ");

  const held = PERMISSION_LIST.filter(p => (shown.permissions & p.bit) !== 0).length;

  return (
    <div className="rl-editor">
      {readOnly && (
        <p className="rl-callout">
          This role ranks at or above your own, so you can see what it grants but not change it.
        </p>
      )}

      <div className="rl-fields">
        <Field label="Name" htmlFor={`rl-name-${role?.id ?? "new"}`}>
          {nameLocked ? (
            <div className="rl-static">
              {shown.name}
              {role?.isSystem && <span className="sc-note">System roles keep their name</span>}
            </div>
          ) : (
            <input
              id={`rl-name-${role?.id ?? "new"}`}
              type="text"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              maxLength={60}
              placeholder="e.g. Rush Chair"
              autoFocus={mode === "create"}
              className="sc-input sc-input-sm"
            />
          )}
        </Field>

        <Field
          label="Rank"
          htmlFor={`rl-rank-${role?.id ?? "new"}`}
          hint={rankInvalid ? undefined : placement || undefined}
        >
          {readOnly ? (
            <div className="rl-static">{shown.rank}</div>
          ) : (
            <input
              id={`rl-rank-${role?.id ?? "new"}`}
              type="number"
              min={0}
              max={rankCapped ? myMaxRank - 1 : undefined}
              value={draft.rank}
              onChange={e => setDraft(d => ({ ...d, rank: Number(e.target.value) }))}
              aria-invalid={rankInvalid}
              className="sc-input sc-input-sm sc-input-num rl-rank"
              style={rankInvalid ? { borderColor: "rgba(var(--rose-rgb),.6)" } : undefined}
            />
          )}
          {rankInvalid && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--rose)" }}>
              Must be below your own rank (max {myMaxRank - 1}).
            </p>
          )}
        </Field>
      </div>
      <p className="sc-note rl-rank-note">
        Higher rank = more authority. Officers can only edit and hand out roles ranked below their own.
      </p>

      <Field label="Color">
        <div className="rl-swatches" role="radiogroup" aria-label="Role color">
          {SWATCHES.map(c => {
            const on = shown.colorTouched && shown.color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={c}
                disabled={readOnly}
                className={`rl-swatch${on ? " on" : ""}`}
                style={{ background: c }}
                onClick={() => setDraft(d => ({ ...d, color: c, colorTouched: true }))}
              />
            );
          })}
          <label className={`rl-swatch rl-swatch-custom${shown.colorTouched && !SWATCHES.some(c => c.toLowerCase() === shown.color.toLowerCase()) ? " on" : ""}`} title="Custom color">
            <input
              type="color"
              value={shown.color}
              disabled={readOnly}
              onChange={e => setDraft(d => ({ ...d, color: e.target.value, colorTouched: true }))}
              aria-label="Custom color"
            />
          </label>
        </div>
        {mode === "edit" && role?.color === null && !draft.colorTouched && (
          <p className="sc-note" style={{ marginTop: 6 }}>No color set — the role shows as neutral grey until you pick one.</p>
        )}
      </Field>

      <div>
        <div className="rl-perm-head">
          <span className="rl-label">Permissions <span className="rl-count">{held} of {PERMISSION_LIST.length}</span></span>
          {!readOnly && (
            <span className="rl-perm-bulk">
              <button type="button" onClick={() => setDraft(d => ({ ...d, permissions: ALL_BITS }))} disabled={draft.permissions === ALL_BITS}>Select all</button>
              <button type="button" onClick={() => setDraft(d => ({ ...d, permissions: 0 }))} disabled={draft.permissions === 0}>Clear</button>
            </span>
          )}
        </div>
        <div className="rl-perm-groups">
          {PERMISSION_GROUPS.map(g => (
            <fieldset key={g.label} className="rl-perm-group">
              <legend className="sc-grp-label">{g.label}</legend>
              <div className="rl-perm-grid">
                {g.perms.map(name => {
                  const bit = PERMISSIONS[name];
                  const on = (shown.permissions & bit) !== 0;
                  return (
                    <label key={name} className={`sc-check rl-perm${on ? " on" : ""}${readOnly ? " ro" : ""}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={readOnly}
                        onChange={() => setDraft(d => ({ ...d, permissions: d.permissions ^ bit }))}
                      />
                      <span aria-hidden className="sc-box">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="sc-check-key block">{permLabel(name)}</span>
                        <span className="sc-check-sub block">{PERMISSION_COPY[name]?.desc ?? name}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      {mode !== "create" && holders && (
        <Field label={`Held by (${holders.length})`}>
          {holders.length === 0 ? (
            <p className="sc-note">No one holds this role yet.</p>
          ) : (
            <div className="rl-holders">
              {holders.map(m => (
                <span key={m.id} className="rl-holder" style={{ "--rl-c": shown.color } as React.CSSProperties}>
                  <span className="rl-holder-dot" aria-hidden="true" />
                  {m.name}
                </span>
              ))}
            </div>
          )}
          <p className="sc-note" style={{ marginTop: 6 }}>Give or take away roles from Settings → Accounts.</p>
        </Field>
      )}

      {!readOnly && (
        <div className="rl-footer">
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={saving} className="sc-btn sc-btn-danger sc-btn-sm">
              Delete role
            </button>
          )}
          <span className="rl-footer-gap" />
          {dirty && mode === "edit" && <span className="sc-dirty">Unsaved</span>}
          {mode === "create" ? (
            <button type="button" onClick={onCancel} className="sc-btn sc-btn-ghost sc-btn-sm">Cancel</button>
          ) : (
            dirty && <button type="button" onClick={onDiscard} disabled={saving} className="sc-btn sc-btn-ghost sc-btn-sm">Discard</button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || (mode === "edit" && !dirty)}
            className="sc-btn sc-btn-primary sc-btn-sm"
          >
            {saving ? "Saving…" : mode === "create" ? "Create role" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="rl-label">{label}</label>
      {children}
      {hint && <p className="sc-note" style={{ marginTop: 5 }}>{hint}</p>}
    </div>
  );
}
