"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Permission } from "@/lib/permissions";
import { Modal } from "../../../../../components/dashboard/primitives";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";
import { PermissionShelf } from "./PermissionShelf";
import { RankLadder } from "./RankLadder";
import { RoleChip } from "./RoleChip";
import { RoleColorPicker } from "./RoleColorPicker";
import {
  DEFAULT_COLOR, PERM_META, bitsOf, gapRank, heldPermissions, ladderRungs, permLabel, templatesFor,
  type Draft, type RoleRow,
} from "./role-copy";
import "./role-sheet.css";

export type SheetMode = "create" | "edit" | "view";

function draftFromRole(role: RoleRow): Draft {
  return {
    name: role.name,
    color: role.color ?? DEFAULT_COLOR,
    rank: role.rank,
    permissions: role.permissions,
    // A persisted null color stays null unless someone picks one.
    colorTouched: role.color !== null,
  };
}

/** Where a new role lands by default: just above members with no role. */
function defaultRank(roles: RoleRow[], myMaxRank: number): number {
  const rungs = ladderRungs(roles);
  const lowestAboveZero = rungs.filter(r => r.rank > 0).pop();
  return gapRank(lowestAboveZero?.rank ?? null, 0, myMaxRank) ?? 0;
}

/**
 * Create, edit or (for roles at or above your own rank) view a role, as one
 * sheet: start from → name + color → what can they change → where it sits,
 * with a live member card and plain-language summary alongside.
 */
export function RoleSheet({
  mode, role, roles, holders, myMaxRank, myRoleIds, canGrant, orgType, previewName,
  saving, onSave, onDelete, onClose, onDirtyChange,
}: {
  mode: SheetMode;
  role?: RoleRow;
  roles: RoleRow[];
  holders?: { id: number; name: string }[];
  myMaxRank: number;
  myRoleIds: Set<number>;
  canGrant: (p: Permission) => boolean;
  orgType: string | null;
  /** Name on the preview card when the role has no holders yet. */
  previewName: string;
  saving: boolean;
  onSave: (draft: Draft) => void;
  onDelete?: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const creating = mode === "create";
  const readOnly = mode === "view";
  const others = useMemo(() => roles.filter(r => r.id !== role?.id), [roles, role?.id]);
  const initial = useMemo<Draft>(
    () => role ? draftFromRole(role) : { name: "", color: DEFAULT_COLOR, rank: defaultRank(roles, myMaxRank), permissions: 0, colorTouched: true },
    // Snapshot once per sheet: a roles refresh underneath must not reset edits.
    [role?.id],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [tpl, setTpl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "close" | "delete">(null);

  const templates = useMemo(() => creating ? templatesFor(orgType, roles.map(r => r.name)) : [], [creating, orgType, roles]);

  const name = draft.name.trim();
  const label = name || (creating ? "New role" : role?.name ?? "This role");
  const nameLocked = readOnly || (mode === "edit" && !!role?.isSystem);
  const clash = !nameLocked && name !== "" && others.some(r => r.name.trim().toLowerCase() === name.toLowerCase());
  const held = heldPermissions(draft.permissions);
  const bigs = held.filter(p => PERM_META[p].big).map(permLabel);

  const dirty = useMemo(() => {
    if (readOnly) return false;
    if (creating) return name !== "" || draft.permissions !== 0;
    return (
      (!role?.isSystem && name !== initial.name) ||
      (draft.colorTouched && draft.color.toLowerCase() !== (role?.color ?? "").toLowerCase()) ||
      draft.rank !== initial.rank ||
      draft.permissions !== initial.permissions
    );
  }, [readOnly, creating, name, draft, initial, role]);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const rankInvalid = !readOnly && draft.rank >= myMaxRank;
  const canSave = !readOnly && !saving && name !== "" && !clash && !rankInvalid && (creating || dirty);

  function requestClose() {
    if (dirty && !saving) setConfirm("close");
    else onClose();
  }

  function applyTemplate(id: string) {
    setTpl(id);
    if (id === "blank") { setDraft(d => ({ ...d, name: "", permissions: 0 })); return; }
    const t = templates.find(x => x.id === id);
    if (!t) return;
    // Only the bits this officer can hand out; the rest would 403 on save.
    const grantable = t.perms.filter(canGrant);
    setDraft(d => ({ ...d, name: t.name, color: t.color, colorTouched: true, permissions: bitsOf(grantable) }));
  }

  const steps: { key: string; title: string; sub: string; done: boolean; body: React.ReactNode }[] = [];
  if (creating && templates.length > 0) {
    steps.push({
      key: "start", title: "Start from", done: tpl !== null,
      sub: "Pick the closest one. It fills everything below, and you can change any of it.",
      body: (
        <div className="rs-tpls">
          <button type="button" className="rs-tpl blank" aria-pressed={tpl === "blank"} onClick={() => applyTemplate("blank")}>
            <span className="rs-ck" aria-hidden="true"><PaperIcon name="check" /></span>
            <span className="nm"><i aria-hidden="true" />Blank</span>
            <span className="ds">Start empty</span>
          </button>
          {templates.map(t => (
            <button key={t.id} type="button" className="rs-tpl" aria-pressed={tpl === t.id} onClick={() => applyTemplate(t.id)} style={{ "--rc": t.color } as React.CSSProperties}>
              <span className="rs-ck" aria-hidden="true"><PaperIcon name="check" /></span>
              <span className="nm"><i aria-hidden="true" />{t.name}</span>
              <span className="ds">{t.blurb} · {t.perms.length} {t.perms.length === 1 ? "page" : "pages"}</span>
            </button>
          ))}
        </div>
      ),
    });
  }
  steps.push({
    key: "name", title: readOnly ? "Name and color" : "Name it and pick a color", done: name !== "",
    sub: "The name and color show on the roster, member cards and task assignments.",
    body: (
      <>
        <label className="sr-only" htmlFor="rs-name">Role name</label>
        <input
          id="rs-name"
          className="rs-name edt-bare"
          value={draft.name}
          maxLength={60}
          placeholder={templates[0] ? `e.g. ${templates[0].name}` : "e.g. Secretary"}
          autoComplete="off"
          readOnly={nameLocked}
          autoFocus={creating}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
        />
        <div className="rs-name-meta">
          <span>
            {clash && <span className="warn">You already have a role called {name}.</span>}
            {mode === "edit" && role?.isSystem && "System roles keep their name."}
          </span>
          {!nameLocked && <span>{draft.name.length}/60</span>}
        </div>
        <span className="rs-lbl">Color</span>
        <RoleColorPicker
          color={draft.color}
          touched={draft.colorTouched}
          readOnly={readOnly}
          onChange={hex => setDraft(d => ({ ...d, color: hex, colorTouched: true }))}
        />
      </>
    ),
  });
  steps.push({
    key: "perms", title: "What can they change?", done: draft.permissions !== 0,
    sub: readOnly
      ? "What holding this role lets someone change. Everyone can already see every page."
      : "Tap the pages this role looks after. Hover or focus one to see exactly what it unlocks.",
    body: (
      <PermissionShelf
        bits={draft.permissions}
        onChange={bits => setDraft(d => ({ ...d, permissions: bits }))}
        canGrant={canGrant}
        readOnly={readOnly}
        roleLabel={label}
      />
    ),
  });
  steps.push({
    key: "rank", title: "Where does it sit?", done: !rankInvalid,
    sub: "Higher roles can hand out and edit the ones below them.",
    body: (
      <>
        <RankLadder
          others={others}
          rank={draft.rank}
          onChange={rank => setDraft(d => ({ ...d, rank }))}
          myMaxRank={myMaxRank}
          myRoleIds={myRoleIds}
          name={label}
          color={draft.colorTouched ? draft.color : "#94A3B8"}
          readOnly={readOnly}
        />
        {rankInvalid && <p className="rs-err">This role sits at or above your own. Pick a spot below you.</p>}
      </>
    ),
  });

  const chipColor = draft.colorTouched ? draft.color : null;
  const sample = holders?.[0]?.name ?? previewName;
  const initials = sample.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?";
  const title = creating ? "Make a new role" : readOnly ? role?.name ?? "Role" : `Edit ${role?.name ?? "role"}`;

  return (
    <Modal ariaLabel={title} onClose={requestClose} hideHeader maxWidthClass="max-w-[1040px]" accent="lilac">
      <div className="rs" style={{ "--rc": chipColor ?? "#94A3B8" } as React.CSSProperties}>
        <div className="rs-cols">
          <div className="rs-form">
            <div className="rs-kicker">Settings · Roles</div>
            <h2 className="rs-h1">{title}</h2>
            <p className="rs-lede">
              {readOnly
                ? "This role ranks at or above your own, so you can see what it grants but not change it."
                : "A role is a title plus the parts of the app that person can change."}
            </p>
            <div className="rs-mini">
              <RoleChip name={label} color={chipColor} />
              <span>{held.length ? `can change ${held.length} ${held.length === 1 ? "page" : "pages"}` : "just a title"}</span>
            </div>

            {steps.map((s, i) => (
              <section key={s.key} className={`rs-step${s.done ? " done" : ""}`} aria-labelledby={`rs-step-${s.key}`}>
                <div className="rs-step-h">
                  <span className="rs-step-n" aria-hidden="true">{i + 1}</span>
                  <h3 className="rs-step-t" id={`rs-step-${s.key}`}>{s.title}</h3>
                </div>
                <p className="rs-step-sub">{s.sub}</p>
                <div className="rs-step-body">{s.body}</div>
              </section>
            ))}
          </div>

          <aside className="rs-side" aria-label="Preview">
            <div className="rs-side-in">
              <div className="rs-pv-lbl">How it&apos;ll look</div>
              <div className="rs-mcard">
                <div className="rs-mc-top">
                  <div className="rs-av" aria-hidden="true">{initials}</div>
                  <div className="min-w-0">
                    <div className="rs-mc-n">{sample}</div>
                    <div className="rs-mc-s">{holders?.length ? "Holds this role" : "Preview on a member card"}</div>
                  </div>
                </div>
                <div className="rs-mc-chips"><RoleChip key={chipColor ?? "none"} name={label} color={chipColor} live /></div>
              </div>

              <div className="rs-can">
                <div className="rs-can-h">{/^[aeiou]/i.test(label) ? "An" : "A"} <em>{label}</em> can…</div>
                <ul>
                  {held.length === 0 && <li className="empty">Nothing extra yet. It&apos;s just a title.</li>}
                  {held.map(p => (
                    <li key={p}><PaperIcon name="check" /><span>{PERM_META[p].can.charAt(0).toUpperCase() + PERM_META[p].can.slice(1)}</span></li>
                  ))}
                  <li className="see"><PaperIcon name="eye" /><span>See everything else, like every member</span></li>
                </ul>
                {bigs.length > 0 && (
                  <div className="rs-careful">
                    <b>Give this one to people you trust.</b> {bigs.join(", ")} {bigs.length > 1 ? "are" : "is"} hard to undo by mistake.
                  </div>
                )}
              </div>

              {mode !== "create" && holders && (
                <div className="rs-holders">
                  <div className="rs-pv-lbl">Held by {holders.length}</div>
                  {holders.length === 0
                    ? <p>No one holds this role yet.</p>
                    : <div className="rs-holder-list">{holders.map(h => <span key={h.id}>{h.name}</span>)}</div>}
                </div>
              )}
              <p className="rs-after">
                {creating ? "After you create it, give" : "Give"} it to people from <b>Accounts</b>{" "}or from anyone&apos;s card on the roster.
              </p>
            </div>
          </aside>
        </div>

        <div className="rs-foot">
          {confirm === "close" ? (
            <>
              <div className="rs-sum"><b>Discard {creating ? "this new role" : "your changes"}?</b> {creating ? "Nothing has been saved yet." : "The role keeps what it had."}</div>
              <div className="rs-btns">
                <button type="button" className="rs-btn ghost" onClick={() => setConfirm(null)}>Keep editing</button>
                <button type="button" className="rs-btn danger" onClick={onClose}>Discard</button>
              </div>
            </>
          ) : confirm === "delete" ? (
            <>
              <div className="rs-sum">
                <b>Delete {role?.name}?</b>{" "}
                {role && role.memberCount > 0 ? `It comes off ${role.memberCount} ${role.memberCount === 1 ? "person" : "people"}. ` : ""}This can&apos;t be undone.
              </div>
              <div className="rs-btns">
                <button type="button" className="rs-btn ghost" onClick={() => setConfirm(null)} disabled={saving}>Keep it</button>
                <button type="button" className="rs-btn danger" onClick={onDelete} disabled={saving}>{saving ? "Deleting…" : "Delete role"}</button>
              </div>
            </>
          ) : (
            <>
              <div className="rs-sum">
                {readOnly
                  ? <>Ranked at or above you · view only</>
                  : name
                    ? <><b>{name}</b> · {held.length ? `changes ${held.length} ${held.length === 1 ? "page" : "pages"}` : "no extra access"} · rank {draft.rank}</>
                    : "Give it a name to save it."}
              </div>
              <div className="rs-btns">
                {onDelete && !readOnly && (
                  <button type="button" className="rs-btn ghost danger-text" onClick={() => setConfirm("delete")} disabled={saving}>Delete</button>
                )}
                <button type="button" className="rs-btn ghost" onClick={requestClose}>{readOnly ? "Close" : "Cancel"}</button>
                {!readOnly && (
                  <button type="button" className="rs-btn" disabled={!canSave} onClick={() => onSave({ ...draft, name })}>
                    {saving ? "Saving…" : creating ? (held.length ? "Create role" : "Create as a label") : "Save changes"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
