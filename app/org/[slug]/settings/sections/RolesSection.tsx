"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../../context/ChapterContext";
import { requestJson } from "../../../../lib/api";
import { PaperIcon } from "../../../../components/paper/PaperIcon";
import { useDirtyGuard } from "../SettingsDirtyContext";
import { RoleSheet, type SheetMode } from "./roles/RoleSheet";
import { RoleCards } from "./roles/RoleCards";
import { PeopleRegister } from "./roles/PeopleRegister";
import { HolderPicker, type PickTarget } from "./roles/HolderPicker";
import { apiMessage, firstName, pairKey, type Person } from "./roles/holders";
import type { Draft, RoleRow } from "./roles/role-copy";
import "./roles/roles-page.css";

type Sheet = { mode: "create" } | { mode: "edit" | "view"; roleId: number };
type View = "role" | "person";
type Toast = { id: number; msg: string; undo?: () => void };

// Which view an officer last used, per device. A convenience only.
const VIEW_KEY = "chaptos:roles-view:v1";

type AccountRow = { id: number; name: string; avatarUrl?: string | null; isSelf: boolean; isAdmin: boolean; roles: { id: number }[] };

export function RolesSection({
  onStatus, onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, can } = useChapter();
  const canManageRoles = can("MANAGE_ROLES");
  // Super-admin maxRank is Infinity (normalized in ChapterContext); for non-admins
  // it's the highest role rank they hold. A role is only grantable, revocable or
  // editable from here when it ranks strictly below that.
  const myMaxRank = currentUser?.maxRank ?? 0;
  const myRoleIds = useMemo(() => new Set((currentUser?.roles ?? []).map(r => r.id)), [currentUser?.roles]);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  // Every BrotherRole pair as `${roleId}:${brotherId}`. Both views and the
  // picker read this one set, so a tap anywhere redraws everywhere at once.
  const [pairs, setPairs] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("role");
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheetDirty, setSheetDirty] = useState(false);
  // The row a create just added, tagged once on its card.
  const [freshId, setFreshId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useDirtyGuard("roles", sheetDirty);

  useEffect(() => {
    try { if (window.localStorage.getItem(VIEW_KEY) === "person") setView("person"); } catch { /* storage blocked */ }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, accounts] = await Promise.all([
        requestJson<RoleRow[]>("/api/roles"),
        requestJson<AccountRow[]>("/api/auth/accounts"),
      ]);
      setRoles([...rolesData].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name)));
      setPeople(accounts.map(a => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl ?? null, isSelf: a.isSelf, isAdmin: a.isAdmin })));
      setPairs(new Set(accounts.flatMap(a => a.roles.map(r => pairKey(r.id, a.id)))));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load roles.");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (freshId == null) return;
    const t = window.setTimeout(() => setFreshId(null), 6000);
    return () => window.clearTimeout(t);
  }, [freshId]);

  const editable = useCallback((r: RoleRow) => canManageRoles && r.rank < myMaxRank, [canManageRoles, myMaxRank]);
  const holds = useCallback((roleId: number, personId: number) => pairs.has(pairKey(roleId, personId)), [pairs]);

  const holdersByRole = useMemo(() => {
    const m = new Map<number, Person[]>();
    for (const r of roles) m.set(r.id, people.filter(p => pairs.has(pairKey(r.id, p.id))));
    return m;
  }, [roles, people, pairs]);
  const rolesByPerson = useMemo(() => {
    const m = new Map<number, RoleRow[]>();
    for (const p of people) m.set(p.id, roles.filter(r => pairs.has(pairKey(r.id, p.id))));
    return m;
  }, [roles, people, pairs]);
  const holdersOf = useCallback((roleId: number) => holdersByRole.get(roleId) ?? [], [holdersByRole]);
  const rolesOf = useCallback((personId: number) => rolesByPerson.get(personId) ?? [], [rolesByPerson]);

  const showToast = useCallback((msg: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const flash = (roleId: number) => {
    setFlashId(null);
    window.requestAnimationFrame(() => setFlashId(roleId));
  };

  // Grant or revoke one pair. The set flips first (the tap should feel instant)
  // and flips back if the server refuses. Grant and revoke are both idempotent
  // server-side; a 409 on grant just means it was already there.
  const toggle = useCallback(async (roleId: number, personId: number, opts: { quiet?: boolean } = {}) => {
    const role = roles.find(r => r.id === roleId);
    const person = people.find(p => p.id === personId);
    const k = pairKey(roleId, personId);
    if (!role || !person || !editable(role) || busy.has(k)) return;
    const adding = !pairs.has(k);

    const flip = (on: boolean) => setPairs(prev => {
      const next = new Set(prev);
      if (on) next.add(k); else next.delete(k);
      return next;
    });
    flip(adding);
    setBusy(prev => new Set(prev).add(k));
    if (adding) flash(roleId);
    try {
      if (adding) {
        await requestJson(`/api/brothers/${personId}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId }),
        }).catch(err => { if ((err as { status?: number }).status !== 409) throw err; });
      } else {
        await requestJson(`/api/brothers/${personId}/roles/${roleId}`, { method: "DELETE" });
      }
      if (!opts.quiet && !pick) {
        const who = person.isSelf ? "You" : firstName(person.name);
        const verb = person.isSelf ? (adding ? "are now" : "are no longer") : (adding ? "is now" : "is no longer");
        showToast(`${who} ${verb} ${role.name}`, () => { void toggleRef.current(roleId, personId, { quiet: true }); });
      }
    } catch (err) {
      flip(!adding);
      onError(apiMessage(err, adding ? `Couldn't give ${role.name} to ${person.name}.` : `Couldn't take ${role.name} from ${person.name}.`));
    } finally {
      setBusy(prev => { const next = new Set(prev); next.delete(k); return next; });
    }
  }, [roles, people, pairs, busy, editable, pick, showToast, onError]);
  // Undo runs a toggle from a toast created by an older render; read the latest.
  const toggleRef = useRef(toggle);
  useEffect(() => { toggleRef.current = toggle; });

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
  const canGrantAny = roles.some(editable);

  return (
    <>
      <div className="rp">
        <div className="rp-bar">
          <div className="rp-views" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "role"} onClick={() => chooseView("role")}>
              <PaperIcon name="board" />By role <span className="n">{roles.length}</span>
            </button>
            <button type="button" aria-pressed={view === "person"} onClick={() => chooseView("person")}>
              <PaperIcon name="people" />By person <span className="n">{people.length}</span>
            </button>
          </div>
          <label className="rp-search">
            <PaperIcon name="search" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a role or person" aria-label="Find a role or person" autoComplete="off" />
          </label>
          <button type="button" className="rp-btn" onClick={() => setSheet({ mode: "create" })} aria-haspopup="dialog">
            <PaperIcon name="plus" />New role
          </button>
        </div>

        {loading && roles.length === 0 ? (
          <p className="rp-none">Loading roles…</p>
        ) : view === "role" ? (
          <RoleCards
            roles={roles}
            holdersOf={holdersOf}
            rolesOf={rolesOf}
            editable={editable}
            query={query}
            freshId={freshId}
            flashId={flashId}
            onAdd={roleId => setPick({ kind: "role", roleId })}
            onRemove={(roleId, p) => toggle(roleId, p.id)}
            onOpen={r => setSheet({ mode: editable(r) ? "edit" : "view", roleId: r.id })}
            onNew={() => setSheet({ mode: "create" })}
          />
        ) : (
          <PeopleRegister
            people={people}
            rolesOf={rolesOf}
            editable={editable}
            canGrantAny={canGrantAny}
            query={query}
            onAdd={personId => setPick({ kind: "person", personId })}
            onRemove={(roleId, p) => toggle(roleId, p.id)}
          />
        )}
      </div>

      {/* Outside .rp: its container-type would make it the containing block
          for these fixed-position layers. */}
      {pick && (
        <HolderPicker
          key={pick.kind === "role" ? `r${pick.roleId}` : `p${pick.personId}`}
          target={pick}
          roles={roles}
          people={people}
          holds={holds}
          busy={busy}
          editable={editable}
          rolesOf={rolesOf}
          onToggle={(roleId, personId) => toggle(roleId, personId)}
          onClose={() => setPick(null)}
        />
      )}

      {mode && (
        <RoleSheet
          key={sheet?.mode === "create" ? "new" : sheetRole?.id}
          mode={mode}
          role={sheetRole}
          roles={roles}
          holders={sheetRole ? holdersOf(sheetRole.id).map(p => ({ id: p.id, name: p.name })) : undefined}
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

      <div className={`rp-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast && (
          <>
            <PaperIcon name="check" />
            <span className="m">{toast.msg}</span>
            {toast.undo && (
              <button type="button" onClick={() => { const u = toast.undo; setToast(null); u?.(); }}>Undo</button>
            )}
          </>
        )}
      </div>
    </>
  );
}
