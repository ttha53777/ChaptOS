"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { PERMISSIONS, PERMISSION_LIST, hasPermission, type Permission } from "@/lib/permissions";
import { requestJson } from "../../../lib/api";

interface RoleRow {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  permissions: number;
  isSystem: boolean;
  memberCount: number;
}

const DEFAULT_COLOR = "#5865F2";

// Pretty labels for the permission checkboxes — keep this in sync with PERMISSIONS.
const PERMISSION_LABELS: Record<Permission, string> = {
  MANAGE_BROTHERS:   "Manage brothers (create, edit, dues, delete)",
  MANAGE_TREASURY:   "Manage treasury (transactions, budget, export)",
  MANAGE_EVENTS:     "Manage events (calendar)",
  MANAGE_PARTIES:    "Manage parties",
  MANAGE_INSTAGRAM:  "Manage Instagram content",
  MANAGE_SERVICE:    "Manage service events",
  MANAGE_ATTENDANCE: "Record attendance, approve excuses",
  MANAGE_SEMESTERS:  "Manage semesters",
  MANAGE_ROLES:      "Manage roles & assignments",
  MANAGE_DOCS:          "Manage docs (pin/edit/delete links)",
  MANAGE_ANNOUNCEMENTS: "Manage chapter announcement",
  MANAGE_SETTINGS:      "Manage org settings & invite links",
  MANAGE_TASKS:         "Manage tasks & deadlines (create, assign, delete)",
};

function permissionSummary(bits: number): string {
  const names = PERMISSION_LIST.filter(p => (bits & p.bit) !== 0)
    .map(p => p.name.replace(/^MANAGE_/, "").toLowerCase());
  if (names.length === 0) return "No permissions";
  if (names.length === PERMISSION_LIST.length) return "All permissions";
  if (names.length > 3) return `${names.slice(0, 3).join(" · ")} +${names.length - 3}`;
  return names.join(" · ");
}

// Full enumerated list of permission names — used as a native `title` tooltip
// on row summaries so users can see the contents of the truncated "+N" without
// having to click into the role. No extra UI dependency.
function permissionTooltip(bits: number): string {
  const names = PERMISSION_LIST.filter(p => (bits & p.bit) !== 0)
    .map(p => p.name.replace(/^MANAGE_/, "").toLowerCase());
  if (names.length === 0) return "No permissions";
  return names.join("\n");
}

export function RolesSection({
  onStatus, onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, can } = useChapter();
  const canManageRoles = can("MANAGE_ROLES");
  // Super-admin maxRank is Infinity (normalized in ChapterContext); for non-admins
  // it's the highest role rank they hold. Used to gate edit/delete on individual rows.
  const myMaxRank = currentUser?.maxRank ?? 0;

  const [roles, setRoles] = useState<RoleRow[]>([]);
  // Per-role member lists, derived from /api/auth/accounts on mount and refresh.
  // Map of roleId → [{ id, name }]. Lets the edit panel show who holds the
  // selected role without an extra round-trip.
  const [membersByRole, setMembersByRole] = useState<Map<number, { id: number; name: string }[]>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);

  // Local form state — mirrors the selected role for editing, or a fresh blank
  // for creation. We don't write back to `roles` until the server confirms.
  //
  // `colorTouched` distinguishes "user picked this color" from "we filled in
  // DEFAULT_COLOR because the role had `color: null` and the native <input
  // type=color> can't display nothing." Without this flag, saving an
  // untouched edit would silently overwrite `null` with `#5865F2`.
  const [draft, setDraft] = useState<{ name: string; color: string; rank: number; permissions: number; colorTouched: boolean }>({
    name: "",
    color: DEFAULT_COLOR,
    rank: 0,
    permissions: 0,
    colorTouched: false,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch roles and accounts in parallel — accounts carries each brother's
      // assigned roles, which we invert into membersByRole below. One round
      // trip instead of N+1 per-role member queries.
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
      // Sort each member list by name so the panel renders consistently.
      for (const list of byRole.values()) list.sort((x, y) => x.name.localeCompare(y.name));
      setMembersByRole(byRole);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load roles.");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { refresh(); }, [refresh]);

  // Load the selected role into the draft form on selection-change OR when
  // entering create mode. NOT on every `roles` update — that would clobber
  // unsaved in-progress edits whenever the parent triggers a refresh (e.g.
  // member grant/revoke from BrotherRoleChips, optimistic save complete, etc.).
  //
  // The intentional reload key is `${creating}|${selectedId}` — anything else
  // about `roles` changing should leave the draft alone.
  const lastSyncedKey = useRef<string | null>(null);
  useEffect(() => {
    const key = creating ? "new" : selectedId != null ? `id:${selectedId}` : null;
    if (key === null) { lastSyncedKey.current = null; return; }
    if (lastSyncedKey.current === key) return;

    if (creating) {
      // New roles default to a real color — picker can't be "unset" anyway and
      // a created role is more useful with a chip color than without.
      setDraft({ name: "", color: DEFAULT_COLOR, rank: 0, permissions: 0, colorTouched: true });
      lastSyncedKey.current = key;
      return;
    }
    const role = roles.find(r => r.id === selectedId);
    if (role) {
      setDraft({
        name: role.name,
        color: role.color ?? DEFAULT_COLOR,
        rank: role.rank,
        permissions: role.permissions,
        // If the persisted color is null, treat it as untouched so saving
        // without picker interaction keeps it null. If it's a real color,
        // mark it touched so the save round-trips that color back.
        colorTouched: role.color !== null,
      });
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

  function togglePermission(bit: number) {
    setDraft(d => ({ ...d, permissions: d.permissions ^ bit }));
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) { onError("Name is required."); return; }
    if (draft.rank >= myMaxRank) {
      onError("Rank must be below your own.");
      return;
    }
    // A role with zero permissions is technically valid (you can still pin
    // people to it for visual grouping) but is almost always a mistake.
    // The server accepts it; the UI warns here so the admin notices before
    // shipping a no-op role and wondering why officers lack access.
    if (draft.permissions === 0 && !window.confirm(
      "This role has no permissions selected — members will get no extra access. Save anyway?",
    )) {
      return;
    }

    // Snapshot the intent at function entry so a state change mid-await
    // (e.g. user clicks a different row) doesn't re-route the response into
    // the wrong branch and silently misattribute the save.
    const intent: { kind: "create" } | { kind: "update"; target: RoleRow } =
      creating ? { kind: "create" } : selected ? { kind: "update", target: selected } : { kind: "create" };
    if (!creating && !selected) { onError("Nothing selected to save."); return; }

    const draftSnapshot = draft;
    // Only round-trip `color` when the user actually touched the picker —
    // otherwise editing a role with color=null would silently overwrite it
    // with the DEFAULT_COLOR the picker had to display as a placeholder.
    const body = JSON.stringify({
      name,
      ...(draftSnapshot.colorTouched ? { color: draftSnapshot.color } : {}),
      rank: draftSnapshot.rank,
      permissions: draftSnapshot.permissions,
    });

    try {
      if (intent.kind === "create") {
        setSavingId("new");
        const created = await requestJson<RoleRow>("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        onStatus(`Created role "${created.name}".`);
        setCreating(false);
        await refresh();
        setSelectedId(created.id);
      } else {
        const target = intent.target;
        setSavingId(target.id);
        // System roles disallow renaming — strip name if unchanged. Color is
        // only included when the user touched the picker (see save() body
        // above for rationale).
        const payload: Record<string, unknown> = {
          rank: draftSnapshot.rank,
          permissions: draftSnapshot.permissions,
        };
        if (draftSnapshot.colorTouched) payload.color = draftSnapshot.color;
        if (!target.isSystem && name !== target.name) payload.name = name;
        await requestJson(`/api/roles/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Apply changes locally instead of full refresh — edits don't change
        // the row set or membership, and refetching causes a visible flicker
        // on the row that was just clicked. refresh() is reserved for create
        // and delete, which DO change the row set.
        const newName = !target.isSystem ? name : target.name;
        const newColor = draftSnapshot.colorTouched ? draftSnapshot.color : target.color;
        setRoles(prev => prev.map(r => r.id === target.id ? {
          ...r,
          name: newName,
          color: newColor,
          rank: draftSnapshot.rank,
          permissions: draftSnapshot.permissions,
        } : r));
        onStatus(`Updated role "${newName}".`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save role.");
    } finally {
      setSavingId(null);
    }
  }

  async function doDelete(role: RoleRow) {
    setSavingId(role.id);
    try {
      await requestJson(`/api/roles/${role.id}`, { method: "DELETE" });
      onStatus(`Deleted role "${role.name}".`);
      if (selectedId === role.id) setSelectedId(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete role.");
    } finally {
      setSavingId(null);
      setDeleteTarget(null);
    }
  }

  // Defense-in-depth: settings nav already hides this tab when !canManageRoles
  // (see app/settings/page.tsx). If a stale session lands here anyway, fall
  // back to a quiet null rather than rendering a wall message.
  if (!canManageRoles) return null;

  return (
    <div className="sc-stack-tight">
      <div className="flex items-start justify-between gap-4">
        <p className="sc-lede" style={{ margin: 0 }}>
          Roles bundle permissions. A brother can hold any number — their effective access is the union.
          Super-admins bypass all checks regardless of roles.
        </p>
        <button
          onClick={() => { setCreating(true); setSelectedId(null); }}
          className="sc-btn sc-btn-primary sc-btn-sm shrink-0"
        >
          + New role
        </button>
      </div>

      {loading ? (
        <p className="sc-note">Loading roles…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* ── Role list ──
              Selected row gets a 2px left accent in the role's color so
              selection is signaled by hue, not opacity (opacity is reserved
              for "you can't edit this"). */}
          <ul className="sc-card">
            {roles.map((r) => {
              const editable = isEditableRow(r);
              const active = !creating && selectedId === r.id;
              const accent = active ? (r.color ?? "var(--vio)") : "transparent";
              return (
                <li key={r.id} className="sc-row" style={{ padding: 0 }}>
                  <button
                    onClick={() => { setCreating(false); setSelectedId(r.id); }}
                    aria-pressed={active}
                    className="relative flex w-full items-center gap-3 px-4 py-3 text-left transition"
                    style={{
                      background: active ? "var(--card-2)" : "transparent",
                      opacity: editable ? 1 : 0.6,
                    }}
                  >
                    <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: accent }} aria-hidden="true" />
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color ?? "var(--muted)" }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="sc-row-key truncate">{r.name}</span>
                        {r.isSystem && <span className="sc-pill sc-pill-muted">System</span>}
                      </span>
                      <span className="block truncate sc-row-sub" title={permissionTooltip(r.permissions)}>
                        rank {r.rank} · {r.memberCount} member{r.memberCount === 1 ? "" : "s"} · {permissionSummary(r.permissions)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ── Edit panel ── */}
          <div className="sc-card" style={{ padding: 18 }}>
            {creating || selected ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="sc-h">
                    {creating ? "New role" : `Edit "${selected!.name}"`}
                  </h3>
                  {!creating && selected && !selected.isSystem && isEditableRow(selected) && (
                    <button onClick={() => setDeleteTarget(selected)} className="sc-btn sc-btn-danger sc-btn-sm">
                      Delete
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <Field label="Name">
                    <input
                      type="text"
                      value={draft.name}
                      onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                      disabled={!creating && (selected?.isSystem ?? false)}
                      maxLength={60}
                      className="sc-input sc-input-sm disabled:opacity-50"
                    />
                    {!creating && selected?.isSystem && (
                      <p className="mt-1 text-[10px]" style={{ color: "var(--faint)" }}>System roles can't be renamed.</p>
                    )}
                  </Field>

                  <Field
                    label="Color"
                    hint={
                      !creating && selected && selected.color === null && !draft.colorTouched
                        ? "No color set. Pick one to assign, or leave untouched to keep it neutral."
                        : undefined
                    }
                  >
                    <input
                      type="color"
                      value={draft.color}
                      onChange={e => setDraft(d => ({ ...d, color: e.target.value, colorTouched: true }))}
                      className="h-8 w-14 cursor-pointer rounded bg-transparent"
                      style={{ border: "1px solid var(--line)" }}
                    />
                  </Field>

                  {(() => {
                    // Super-admins (Infinity maxRank) can pick any positive rank;
                    // everyone else is capped one below their own.
                    const rankCapped = Number.isFinite(myMaxRank);
                    const maxRank = rankCapped ? myMaxRank - 1 : undefined;
                    const rankInvalid = rankCapped && draft.rank >= myMaxRank;
                    const hint = rankCapped
                      ? `Higher rank = more authority. Max for you: ${myMaxRank - 1}.`
                      : "Higher rank = more authority.";
                    return (
                      <Field label="Rank" hint={rankInvalid ? undefined : hint}>
                        <input
                          type="number"
                          min={0}
                          max={maxRank}
                          value={draft.rank}
                          onChange={e => setDraft(d => ({ ...d, rank: Number(e.target.value) }))}
                          aria-invalid={rankInvalid}
                          className="sc-input sc-input-sm w-28"
                          style={rankInvalid ? { borderColor: "rgba(217,139,163,.6)" } : undefined}
                        />
                        {rankInvalid && (
                          <p className="mt-1 text-[10.5px]" style={{ color: "var(--rose)" }}>
                            Rank must be below your own (max {myMaxRank - 1}).
                          </p>
                        )}
                      </Field>
                    );
                  })()}

                  <Field label="Permissions">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {PERMISSION_LIST.map(p => (
                        <label
                          key={p.name}
                          className="flex items-start gap-2 rounded-lg p-2 text-[12px]"
                          style={{ border: "1px solid var(--line-soft)", background: "var(--paper-2)", color: "var(--ink-soft)" }}
                        >
                          <input
                            type="checkbox"
                            checked={hasPermission(draft.permissions, p.name)}
                            onChange={() => togglePermission(p.bit)}
                            className="mt-0.5"
                            style={{ accentColor: "var(--vio)" }}
                          />
                          <span>
                            <span className="block font-medium" style={{ color: "var(--ink)" }}>{p.name.replace(/^MANAGE_/, "").toLowerCase()}</span>
                            <span className="block text-[10.5px]" style={{ color: "var(--faint)" }}>{PERMISSION_LABELS[p.name]}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </Field>

                  {/* Members holding this role. Skipped during creation
                      because the role hasn't been persisted yet. */}
                  {!creating && selected && (
                    <MembersList
                      members={membersByRole.get(selected.id) ?? []}
                      color={draft.color}
                    />
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    {creating && (
                      <button onClick={() => setCreating(false)} className="sc-btn sc-btn-ghost sc-btn-sm">
                        Cancel
                      </button>
                    )}
                    <button onClick={save} disabled={savingId !== null} className="sc-btn sc-btn-primary sc-btn-sm">
                      {savingId !== null ? "Saving…" : creating ? "Create role" : "Save changes"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="sc-note">Select a role to edit, or create a new one.</p>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete role "${deleteTarget.name}"?`}
          message={
            deleteTarget.memberCount > 0
              ? `This will revoke the role from ${deleteTarget.memberCount} brother${deleteTarget.memberCount === 1 ? "" : "s"}. This cannot be undone.`
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: ".1em" }}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10.5px]" style={{ color: "var(--faint)" }}>{hint}</p>}
    </div>
  );
}

// Members holding the selected role. Renders the same colored chips used in
// AccountsSection.BrotherRoleChips for visual consistency. Scrolls past ~12
// names so a heavily-assigned role doesn't blow out the panel height.
function MembersList({ members, color }: { members: { id: number; name: string }[]; color: string }) {
  return (
    <Field label={`Members (${members.length})`}>
      {members.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--faint)" }}>No one holds this role yet.</p>
      ) : (
        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
          {members.map(m => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: `${color}1a`,
                color: color,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: color }}
                aria-hidden="true"
              />
              {m.name}
            </span>
          ))}
        </div>
      )}
    </Field>
  );
}

// Bit-OR is exported from PERMISSIONS already; the trick `permissions ^ bit`
// for toggle works because each PERMISSIONS value sets exactly one bit.
// PERMISSIONS itself isn't referenced directly here but the type narrowing
// flows through `Permission` in PERMISSION_LIST.
void PERMISSIONS;
