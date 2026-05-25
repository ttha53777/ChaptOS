"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/dashboard/primitives";
import { useChapter } from "../../context/ChapterContext";
import { PERMISSIONS, PERMISSION_LIST, hasPermission, type Permission } from "@/lib/permissions";

interface RoleRow {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  permissions: number;
  isSystem: boolean;
  memberCount: number;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch { /* ignore */ }
    throw new Error(`${url} returned ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const DEFAULT_COLOR = "#5865F2";

// Pretty labels for the permission checkboxes — keep this in sync with PERMISSIONS.
const PERMISSION_LABELS: Record<Permission, string> = {
  MANAGE_BROTHERS:   "Manage brothers (create, edit, dues, delete)",
  MANAGE_TREASURY:   "Manage treasury (transactions, budget, export)",
  MANAGE_EVENTS:     "Manage events (calendar, deadlines)",
  MANAGE_PARTIES:    "Manage parties",
  MANAGE_INSTAGRAM:  "Manage Instagram content",
  MANAGE_SERVICE:    "Manage service events",
  MANAGE_ATTENDANCE: "Record attendance, approve excuses",
  MANAGE_SEMESTERS:  "Manage semesters",
  MANAGE_ROLES:      "Manage roles & assignments",
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
  const [draft, setDraft] = useState<{ name: string; color: string; rank: number; permissions: number }>({
    name: "",
    color: DEFAULT_COLOR,
    rank: 0,
    permissions: 0,
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

  // Load the selected role into the draft form whenever the selection changes.
  useEffect(() => {
    if (creating) {
      setDraft({ name: "", color: DEFAULT_COLOR, rank: 0, permissions: 0 });
      return;
    }
    if (selectedId == null) return;
    const role = roles.find(r => r.id === selectedId);
    if (role) {
      setDraft({
        name: role.name,
        color: role.color ?? DEFAULT_COLOR,
        rank: role.rank,
        permissions: role.permissions,
      });
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

    const body = JSON.stringify({
      name,
      color: draft.color,
      rank: draft.rank,
      permissions: draft.permissions,
    });

    try {
      if (creating) {
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
      } else if (selected) {
        setSavingId(selected.id);
        // System roles disallow renaming — strip name if unchanged.
        const payload: Record<string, unknown> = {
          color: draft.color,
          rank: draft.rank,
          permissions: draft.permissions,
        };
        if (!selected.isSystem && name !== selected.name) payload.name = name;
        await requestJson(`/api/roles/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Apply changes locally instead of full refresh — edits don't change
        // the row set or membership, and refetching causes a visible flicker
        // on the row that was just clicked. refresh() is reserved for create
        // and delete, which DO change the row set.
        const newName = !selected.isSystem ? name : selected.name;
        setRoles(prev => prev.map(r => r.id === selected.id ? {
          ...r,
          name: newName,
          color: draft.color,
          rank: draft.rank,
          permissions: draft.permissions,
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
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-semibold text-white">Roles</h2>
          <p className="mt-1 text-[12px] text-white/55">
            Roles bundle permissions. A brother can hold any number — their effective access is the union.
            Super-admins (the {`isAdmin`} bit on Brother) bypass all checks regardless of roles.
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setSelectedId(null); }}
          className="shrink-0 rounded-lg bg-indigo-500/90 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500"
        >
          + New role
        </button>
      </header>

      {loading ? (
        <p className="text-[12px] text-white/40">Loading roles…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* ── Role list ──
              Container + row-divider styling mirrors AccountsSection so the
              two settings sections look like siblings. Selected row gets a
              2px left accent in the role's color so selection is signaled by
              hue, not opacity (opacity is reserved for "you can't edit this"). */}
          <ul className="rounded-xl border border-white/[0.06] overflow-hidden">
            {roles.map((r, i) => {
              const editable = isEditableRow(r);
              const active = !creating && selectedId === r.id;
              const accent = active ? (r.color ?? "rgba(255,255,255,0.4)") : "transparent";
              return (
                <li key={r.id} className={i < roles.length - 1 ? "border-b border-white/[0.04]" : ""}>
                  <button
                    onClick={() => { setCreating(false); setSelectedId(r.id); }}
                    aria-pressed={active}
                    className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"
                    } ${editable ? "" : "opacity-60"}`}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-[2px]"
                      style={{ background: accent }}
                      aria-hidden="true"
                    />
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: r.color ?? "rgba(255,255,255,0.2)" }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-white">{r.name}</span>
                        {r.isSystem && (
                          <span className="rounded bg-white/[0.06] px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider text-white/40">
                            System
                          </span>
                        )}
                      </span>
                      <span
                        className="block truncate text-[11px] text-white/40"
                        title={permissionTooltip(r.permissions)}
                      >
                        rank {r.rank} · {r.memberCount} member{r.memberCount === 1 ? "" : "s"} · {permissionSummary(r.permissions)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ── Edit panel ── */}
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
            {creating || selected ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-[14px] font-semibold text-white">
                    {creating ? "New role" : `Edit "${selected!.name}"`}
                  </h3>
                  {!creating && selected && !selected.isSystem && isEditableRow(selected) && (
                    <button
                      onClick={() => setDeleteTarget(selected)}
                      className="rounded-lg px-2 py-1 text-[12px] text-red-300 hover:bg-red-500/10"
                    >
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
                      className="w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[13px] text-white outline-none focus:border-indigo-500/40 disabled:opacity-50"
                    />
                    {!creating && selected?.isSystem && (
                      <p className="mt-1 text-[10px] text-white/35">System roles can't be renamed.</p>
                    )}
                  </Field>

                  <Field label="Color">
                    <input
                      type="color"
                      value={draft.color}
                      onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                      className="h-8 w-14 cursor-pointer rounded border border-white/[0.07] bg-transparent"
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
                          className={`w-28 rounded-lg border bg-white/[0.03] px-3 py-1.5 text-[13px] text-white outline-none ${
                            rankInvalid
                              ? "border-red-500/60 focus:border-red-500/80"
                              : "border-white/[0.07] focus:border-indigo-500/40"
                          }`}
                        />
                        {rankInvalid && (
                          <p className="mt-1 text-[10.5px] text-red-300">
                            Rank must be below your own (max {myMaxRank - 1}).
                          </p>
                        )}
                      </Field>
                    );
                  })()}

                  <Field label="Permissions">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {PERMISSION_LIST.map(p => (
                        <label key={p.name} className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2 text-[12px] text-white/75 hover:bg-white/[0.04]">
                          <input
                            type="checkbox"
                            checked={hasPermission(draft.permissions, p.name)}
                            onChange={() => togglePermission(p.bit)}
                            className="mt-0.5 accent-indigo-500"
                          />
                          <span>
                            <span className="block font-medium text-white/90">{p.name.replace(/^MANAGE_/, "").toLowerCase()}</span>
                            <span className="block text-[10.5px] text-white/45">{PERMISSION_LABELS[p.name]}</span>
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
                      <button
                        onClick={() => setCreating(false)}
                        className="rounded-lg px-3 py-1.5 text-[12px] text-white/60 hover:bg-white/[0.04]"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={save}
                      disabled={savingId !== null}
                      className="rounded-lg bg-indigo-500/90 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {savingId !== null ? "Saving…" : creating ? "Create role" : "Save changes"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-white/40">Select a role to edit, or create a new one.</p>
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
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10.5px] text-white/35">{hint}</p>}
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
        <p className="text-[11px] text-white/35">No one holds this role yet.</p>
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
