"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Permission } from "@/lib/permissions";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";
import { Face } from "./Face";
import {
  PERM_GROUPS, canSentence, firstName, heldPermissions, permLabel, permsOf,
  type AccountRow, type RoleInfo,
} from "./access";

export interface SheetPowers {
  /** MANAGE_BROTHERS — rename anyone, remove people. */
  manage: boolean;
  /** Same gate as PATCH /api/auth/accounts/:id. */
  admin: boolean;
  /** MANAGE_ROLES — grant/revoke roles ranked below `maxRank`. */
  roles: boolean;
  maxRank: number;
}

/**
 * Everything you can do to one person, in a sheet off the right edge (a bottom
 * sheet on phones): rename, the admin switch, roles, and remove. Role and admin
 * changes apply at once, like the chips they replaced; the parent owns the
 * requests and the undo toast.
 */
export function PersonSheet({
  person, roles, roleMap, holders, powers, avatarUrl, orgName, archiveHref,
  onRename, onSetAdmin, onToggleRole, onRemove, onClose,
}: {
  person: AccountRow;
  roles: RoleInfo[];
  roleMap: Map<number, RoleInfo>;
  /** roleId → everyone holding it. */
  holders: Map<number, AccountRow[]>;
  powers: SheetPowers;
  avatarUrl: string | null;
  orgName: string;
  archiveHref: string;
  onRename: (name: string) => Promise<boolean>;
  onSetAdmin: (next: boolean) => Promise<void>;
  onToggleRole: (role: RoleInfo, give: boolean) => Promise<void>;
  onRemove: () => Promise<boolean>;
  onClose: () => void;
}) {
  const p = person;
  const me = p.isSelf;
  const who = me ? "you" : firstName(p.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const [confirm, setConfirm] = useState<null | "admin" | "remove">(null);
  const [busy, setBusy] = useState<null | "name" | "admin" | "remove" | number>(null);
  const [flash, setFlash] = useState<Permission[]>([]);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const perms = permsOf(p, roleMap);
  const prevPerms = useRef(perms);
  useEffect(() => {
    const before = new Set(prevPerms.current ?? []);
    const lit = (perms ?? []).filter(k => !before.has(k));
    prevPerms.current = perms;
    if (!lit.length) return;
    setFlash(lit);
    const t = setTimeout(() => setFlash([]), 600);
    return () => clearTimeout(t);
    // perms is derived fresh every render; key the effect on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(perms ?? []).join()]);

  // Slide in on the next frame; remember the trigger to hand focus back.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => { setShown(true); panelRef.current?.focus(); });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prevOverflow;
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, []);

  // Escape backs out one layer at a time; Tab stays inside the sheet.
  const layers = useRef({ editing, confirm });
  layers.current = { editing, confirm };
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (layers.current.editing) setEditing(false);
        else if (layers.current.confirm) setConfirm(null);
        else onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = [...panelRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, a[href]")];
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const canRename = powers.manage || me;
  const canRemove = powers.manage && !me;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name || name === p.name) { setEditing(false); return; }
    setBusy("name");
    const ok = await onRename(name);
    setBusy(null);
    if (ok) setEditing(false);
  }

  async function goAdmin() {
    setBusy("admin");
    await onSetAdmin(!p.isAdmin);
    setBusy(null);
    setConfirm(null);
  }

  async function toggle(role: RoleInfo, give: boolean) {
    setBusy(role.id);
    await onToggleRole(role, give);
    setBusy(null);
  }

  async function goRemove() {
    setBusy("remove");
    const ok = await onRemove();
    if (!ok) setBusy(null);
  }

  const verdict = p.isAdmin
    ? <><b>{me ? "You" : firstName(p.name)}</b> {me ? "hold" : "holds"} the master key: {me ? "you" : "they"} can change every page here, manage billing, and make other admins.</>
    : perms === null
      ? <><b>{me ? "You" : firstName(p.name)}</b> {me ? "hold" : "holds"} {p.roles.length === 1 ? "the role" : "the roles"} {p.roles.map(r => r.name).join(", ")}. What each role unlocks is set in Roles.</>
      : perms.length
        ? <><b>{me ? "You" : firstName(p.name)}</b> can {canSentence(perms)}.</>
        : <><b>{me ? "You" : firstName(p.name)}</b> can see the whole chapter and change {me ? "your" : "their"} own profile, RSVPs and tasks.{powers.roles ? ` Give ${me ? "yourself" : "them"} a role to unlock more.` : ""}</>;

  const sheet = (
    <div className="ac-sheet-root">
      <div className={`ac-scrim${shown ? " on" : ""}`} onClick={onClose} />
      <div
        ref={panelRef}
        className={`ac-sheet${shown ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={p.name}
        tabIndex={-1}
      >
        <div className="ac-sh-head">
          <button className="ac-sh-x" type="button" onClick={onClose} aria-label="Close">
            <PaperIcon name="x" className="ac-ic" />
          </button>
          <div className="ac-sh-id">
            <Face name={p.name} src={avatarUrl} admin={p.isAdmin} size={62} />
            <div className="ac-sh-name">
              {editing ? (
                <form className="ac-rename" onSubmit={saveName}>
                  <input
                    autoFocus
                    value={draft}
                    maxLength={80}
                    disabled={busy === "name"}
                    aria-label={`Name in ${orgName}`}
                    onChange={e => setDraft(e.target.value)}
                    onFocus={e => e.currentTarget.select()}
                  />
                  <button className="ac-btn sm" type="submit" disabled={busy === "name" || !draft.trim()}>{busy === "name" ? "Saving…" : "Save"}</button>
                  <button className="ac-btn sm ghost" type="button" disabled={busy === "name"} onClick={() => setEditing(false)}>Cancel</button>
                </form>
              ) : (
                <div className="ac-nm-line">
                  <h2>{p.name}</h2>
                  {canRename && (
                    <button className="ac-pen" type="button" onClick={() => { setDraft(p.name); setEditing(true); }} title="Rename" aria-label={`Rename ${p.name}`}>
                      <PaperIcon name="pencil" className="ac-ic" />
                    </button>
                  )}
                </div>
              )}
              <div className="ac-sh-meta">
                {p.email && <span className="ac-meta"><PaperIcon name="envelope" className="ac-ic" /><span>{p.email}</span></span>}
                <span className={`ac-meta${p.linked ? " ok" : ""}`}>
                  <PaperIcon name={p.linked ? "check" : "lock"} className="ac-ic" />
                  <span>{p.linked ? "Signs in with Google" : "Can't sign in"}</span>
                </span>
                {me && <span className="ac-meta you">You</span>}
              </div>
            </div>
          </div>
          {canRename && <p className="ac-sh-note">Renaming only changes what {orgName} calls {me ? "you" : "them"}. Other chapters keep their own name.</p>}
        </div>

        <div className="ac-sh-body">
          <section className="ac-sh-sec">
            <div className="ac-sh-k">What {who} can do</div>
            <div className={`ac-verdict${p.isAdmin ? " all" : ""}`}>{verdict}</div>
          </section>

          {powers.admin && (
            <section className="ac-sh-sec">
              <div className="ac-sh-k">Master key</div>
              <div className={`ac-master${p.isAdmin ? " on" : ""}`}>
                <span className="ac-tile"><PaperIcon name="key" className="ac-ic" /></span>
                <span className="ac-master-tx">
                  <b>Admin</b>
                  <small>{me ? "You can't take your own key. Another admin can." : "Every page, every setting, billing. Ignores roles."}</small>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="ac-switch"
                  aria-checked={p.isAdmin}
                  aria-label="Admin"
                  disabled={me || busy === "admin"}
                  onClick={() => setConfirm(c => c === "admin" ? null : "admin")}
                />
              </div>
              {confirm === "admin" && (
                <div className="ac-confirm" style={{ "--c": "var(--pp-lilac)" } as React.CSSProperties}>
                  <p>
                    {p.isAdmin
                      ? <>Take the master key from <b>{firstName(p.name)}</b>? They keep only what their roles allow.</>
                      : <>Give <b>{firstName(p.name)}</b> the master key? They&apos;ll be able to change everything here, including billing.</>}
                  </p>
                  <div className="ac-acts">
                    <button className="ac-btn sm ghost" type="button" onClick={() => setConfirm(null)}>Cancel</button>
                    <button className="ac-btn sm" type="button" disabled={busy === "admin"} onClick={goAdmin} style={{ "--hs": "var(--pp-lilac)" } as React.CSSProperties}>
                      {busy === "admin" ? "Saving…" : p.isAdmin ? "Take key" : "Make admin"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {(roles.length > 0) && (powers.roles || p.roles.length > 0) && (
            <section className="ac-sh-sec">
              <div className="ac-sh-k">
                Roles
                <span>{powers.roles ? "Tick to give, untick to take away" : ""}</span>
              </div>
              {p.isAdmin && powers.roles && <p className="ac-sh-hint">Admins can already change everything, so a role here works as a title.</p>}
              <div className="ac-rlist">
                {(powers.roles ? roles : roles.filter(r => p.roles.some(x => x.id === r.id))).map(r => {
                  const on = p.roles.some(x => x.id === r.id);
                  const reachable = powers.roles && r.rank < powers.maxRank;
                  const others = (holders.get(r.id) ?? []).filter(x => x.id !== p.id);
                  const names = others.slice(0, 2).map(x => firstName(x.name)).join(", ");
                  const held = others.length ? (others.length > 2 ? `${names} +${others.length - 2}` : `${names} too`) : on ? "" : "Nobody yet";
                  const desc = r.permissions === undefined ? null
                    : heldPermissions(r.permissions).map(permLabel).join(" · ") || "A title, no extra pages";
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className="ac-ropt"
                      style={{ "--rc": r.color ?? "#94A3B8" } as React.CSSProperties}
                      disabled={!reachable || busy === r.id}
                      onClick={() => toggle(r, !on)}
                    >
                      <span className="ac-box"><PaperIcon name="check" className="ac-ic" /></span>
                      <span className="ac-ropt-tx">
                        <span className="ac-rn"><i />{r.name}</span>
                        {desc && <span className="ac-rd">{desc}</span>}
                      </span>
                      {powers.roles && !reachable
                        ? <span className="ac-held"><PaperIcon name="lock" className="ac-ic" />Above your rank</span>
                        : <span className={`ac-held${!others.length && !on ? " unheld" : ""}`}>{held}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {perms !== null && (
            <section className="ac-sh-sec">
              <div className="ac-sh-k">Pages {me ? "you" : "they"} can change</div>
              <div className="ac-board">
                {PERM_GROUPS.map(g => (
                  <div key={g.label} className="ac-bgrp" style={{ "--t": `var(--pp-${g.tone})` } as React.CSSProperties}>
                    <div className="ac-bgrp-h"><i />{g.label}</div>
                    <div className="ac-pages">
                      {g.perms.map(k => (
                        <span key={k} className={`ac-pg${perms.includes(k) ? " lit" : ""}${flash.includes(k) ? " flash" : ""}`}>{permLabel(k)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {canRemove && (
          <div className="ac-sh-foot">
            {confirm === "remove" ? (
              <div className="ac-confirm" style={{ "--c": "var(--pp-rose)", marginTop: 0 } as React.CSSProperties}>
                <p>
                  Remove <b>{p.name}</b> from {orgName}? Their attendance, dues, service and roles here are erased.
                  Ledger transactions stay on the books. <b>This can&apos;t be undone.</b> To keep their history,
                  archive them from the roster instead.
                </p>
                <div className="ac-acts">
                  <button className="ac-btn sm ghost" type="button" onClick={() => setConfirm(null)}>Cancel</button>
                  <Link className="ac-btn sm ghost" href={archiveHref}>Archive instead</Link>
                  <button className="ac-btn sm rose solid" type="button" disabled={busy === "remove"} onClick={goRemove}>
                    {busy === "remove" ? "Removing…" : "Remove for good"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="ac-rm">
                <p>No longer in the chapter? Removing them erases their records here.</p>
                <button className="ac-btn sm rose" type="button" onClick={() => setConfirm("remove")}>Remove…</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
