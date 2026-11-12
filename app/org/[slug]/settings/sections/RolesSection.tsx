"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useChapter } from "../../../../context/ChapterContext";
import { requestJson } from "../../../../lib/api";
import { PaperIcon } from "../../../../components/paper/PaperIcon";
import { useDirtyGuard } from "../SettingsDirtyContext";
import { RoleSheet, type SheetMode } from "./roles/RoleSheet";
import { RoleChip } from "./roles/RoleChip";
import { permissionSummary, type Draft, type RoleRow } from "./roles/role-copy";

function peopleCount(n: number): string {
  return n === 0 ? "No one yet" : `${n} ${n === 1 ? "person" : "people"}`;
}

type Sheet = { mode: "create" } | { mode: "edit" | "view"; roleId: number };

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
  const myRoleIds = useMemo(() => new Set((currentUser?.roles ?? []).map(r => r.id)), [currentUser?.roles]);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  // roleId → holders, inverted from /api/auth/accounts so the sheet can show
  // who holds a role without a per-role round trip.
  const [membersByRole, setMembersByRole] = useState<Map<number, { id: number; name: string }[]>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheetDirty, setSheetDirty] = useState(false);
  // The row a create just added, highlighted once in the list.
  const [freshId, setFreshId] = useState<number | null>(null);

  useDirtyGuard("roles", sheetDirty);

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

  const isEditableRow = useCallback(
    (r: RoleRow) => canManageRoles && r.rank < myMaxRank,
    [canManageRoles, myMaxRank],
  );

  const sheetRole = sheet && sheet.mode !== "create" ? roles.find(r => r.id === sheet.roleId) : undefined;

  const closeSheet = useCallback(() => { setSheet(null); setSheetDirty(false); }, []);

  async function save(d: Draft) {
    if (!sheet) return;
    setSaving(true);
    try {
      if (sheet.mode === "create") {
        const created = await requestJson<RoleRow>("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: d.name, color: d.color, rank: d.rank, permissions: d.permissions }),
        });
        onStatus(`Created role "${created.name}".`);
        closeSheet();
        setFreshId(created.id);
        // Not awaited: `saving` must clear now, or a sheet reopened before the
        // refetch lands would read as mid-save (no discard guard, Save disabled).
        void refresh();
      } else if (sheetRole) {
        const target = sheetRole;
        // Send only what changed: an unchanged bitfield can still carry bits the
        // editor doesn't hold, which the server would refuse to re-assign.
        const payload: Record<string, unknown> = {};
        if (d.rank !== target.rank) payload.rank = d.rank;
        if (d.permissions !== target.permissions) payload.permissions = d.permissions;
        if (d.colorTouched && d.color.toLowerCase() !== (target.color ?? "").toLowerCase()) payload.color = d.color;
        if (!target.isSystem && d.name !== target.name) payload.name = d.name;
        await requestJson(`/api/roles/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const newName = !target.isSystem ? d.name : target.name;
        setRoles(prev => prev
          .map(r => r.id === target.id ? {
            ...r, name: newName, color: d.colorTouched ? d.color : r.color, rank: d.rank, permissions: d.permissions,
          } : r)
          .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name)));
        onStatus(`Saved "${newName}".`);
        closeSheet();
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
      closeSheet();
      void refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete role.");
    } finally {
      setSaving(false);
    }
  }

  // Defense-in-depth: the settings nav already hides this section without
  // MANAGE_ROLES; render nothing if a stale session lands here anyway.
  if (!canManageRoles) return null;

  const mode: SheetMode | null = sheet ? (sheet.mode === "create" ? "create" : sheetRole ? sheet.mode : null) : null;

  return (
    <div className="sc-stack-tight">
      <div className="rl-bar">
        <p className="sc-note">
          One person can hold several roles; their access is everything those roles grant combined.
          Org admins have full access regardless of roles; see Accounts.
        </p>
        <button onClick={() => setSheet({ mode: "create" })} className="sc-btn sc-btn-primary sc-btn-sm shrink-0">
          + New role
        </button>
      </div>

      {loading && roles.length === 0 ? (
        <p className="sc-note">Loading roles…</p>
      ) : (
        <ul className="sc-card rl-list">
          {roles.map((r) => {
            const editable = isEditableRow(r);
            return (
              <li key={r.id} className={`rl-item${freshId === r.id ? " rl-fresh" : ""}`} onAnimationEnd={() => freshId === r.id && setFreshId(null)}>
                <button
                  type="button"
                  onClick={() => setSheet({ mode: editable ? "edit" : "view", roleId: r.id })}
                  className="rl-head"
                  aria-haspopup="dialog"
                >
                  <span className="rl-head-main">
                    <span className="rl-title">
                      <RoleChip name={r.name} color={r.color} />
                      {freshId === r.id && <span className="rl-new">New</span>}
                      {r.isSystem && <span className="sc-pill sc-pill-muted">System</span>}
                      {!editable && (
                        <span className="rl-locked" title="Ranked at or above your own role — view only">
                          <PaperIcon name="lock" />
                          View only
                        </span>
                      )}
                    </span>
                    <span className="rl-sub">{permissionSummary(r.permissions)}</span>
                  </span>
                  <span className="rl-meta">
                    <span>{peopleCount(r.memberCount)}</span>
                    <span className="rl-meta-rank">Rank {r.rank}</span>
                  </span>
                  <PaperIcon name="chev-r" className="rl-chev" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {mode && (
        <RoleSheet
          key={sheet?.mode === "create" ? "new" : sheetRole?.id}
          mode={mode}
          role={sheetRole}
          roles={roles}
          holders={sheetRole ? membersByRole.get(sheetRole.id) ?? [] : undefined}
          myMaxRank={myMaxRank}
          myRoleIds={myRoleIds}
          canGrant={can}
          orgType={currentUser?.org?.orgType ?? null}
          previewName={currentUser?.name ?? "A member"}
          saving={saving}
          onSave={save}
          onDelete={sheetRole && !sheetRole.isSystem && mode === "edit" ? () => doDelete(sheetRole) : undefined}
          onClose={closeSheet}
          onDirtyChange={setSheetDirty}
        />
      )}
    </div>
  );
}
