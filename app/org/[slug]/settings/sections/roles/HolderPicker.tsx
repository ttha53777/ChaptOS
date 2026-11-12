import React, { useState } from "react";
import { Modal } from "../../../../../components/dashboard/primitives";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";
import { HolderAvatar } from "./HolderAvatar";
import { firstName, pairKey, permTags, roleColor, type Person } from "./holders";
import type { RoleRow } from "./role-copy";

export type PickTarget = { kind: "role"; roleId: number } | { kind: "person"; personId: number };

/**
 * One sheet for both directions: "Who's a Treasurer?" (people for a role) or
 * a person's roles. Each tap grants or revokes straight away, the way the
 * Accounts chips always have; the tick is the confirmation.
 */
export function HolderPicker({
  target, roles, people, holds, busy, editable, rolesOf, onToggle, onClose,
}: {
  target: PickTarget;
  roles: RoleRow[];
  people: Person[];
  holds: (roleId: number, personId: number) => boolean;
  busy: Set<string>;
  editable: (r: RoleRow) => boolean;
  rolesOf: (personId: number) => RoleRow[];
  onToggle: (roleId: number, personId: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const role = target.kind === "role" ? roles.find(r => r.id === target.roleId) : undefined;
  const person = target.kind === "person" ? people.find(p => p.id === target.personId) : undefined;
  // Who held the role when the sheet opened. Sections are drawn from this, so a
  // tapped row ticks in place instead of jumping to the other section.
  const [had] = useState(() => new Set(role ? people.filter(p => holds(role.id, p.id)).map(p => p.id) : []));

  if (!role && !person) return null;
  const needle = q.trim().toLowerCase();
  const accent = role ? roleColor(role) : null;

  const tick = <span className="rp-tick" aria-hidden><PaperIcon name="check" /></span>;

  let list: React.ReactNode;
  let summary: React.ReactNode;
  if (role) {
    const matches = people.filter(p => !needle || p.name.toLowerCase().includes(needle));
    const option = (p: Person) => {
      const on = holds(role.id, p.id);
      const others = rolesOf(p.id).filter(x => x.id !== role.id).map(x => x.name);
      return (
        <button
          key={p.id} type="button" role="option" aria-selected={on}
          className="rp-opt" disabled={busy.has(pairKey(role.id, p.id))}
          onClick={() => onToggle(role.id, p.id)}
        >
          <HolderAvatar id={p.id} name={p.name} url={p.avatarUrl} size={32} />
          <span className="rp-opt-tx">
            <b>{p.name}{p.isSelf ? " · You" : ""}</b>
            <small>{others.length ? others.join(" · ") : "No other role"}</small>
          </span>
          {tick}
        </button>
      );
    };
    const before = matches.filter(p => had.has(p.id));
    const rest = matches.filter(p => !had.has(p.id));
    list = (
      <>
        {before.length > 0 && <div className="rp-sec">Has it · {before.length}</div>}
        {before.map(option)}
        {rest.length > 0 && <div className="rp-sec">{before.length ? "Everyone else" : "Everyone"}</div>}
        {rest.map(option)}
        {matches.length === 0 && <p className="rp-none">No one called “{q.trim()}”.</p>}
      </>
    );
    const n = people.filter(p => holds(role.id, p.id)).length;
    summary = n ? <><b>{n}</b> {n === 1 ? "person has" : "people have"} this role</> : "No one has this role yet";
  } else {
    const p = person!;
    const matches = roles.filter(r => !needle || r.name.toLowerCase().includes(needle));
    list = (
      <>
        {matches.map(r => {
          const on = holds(r.id, p.id);
          const ok = editable(r);
          return (
            <button
              key={r.id} type="button" role="option" aria-selected={on}
              className="rp-opt" disabled={!ok || busy.has(pairKey(r.id, p.id))}
              onClick={() => onToggle(r.id, p.id)}
              style={{ "--rc": roleColor(r) } as React.CSSProperties}
            >
              <span className="rp-dot" aria-hidden />
              <span className="rp-opt-tx">
                <b>{r.name}</b>
                <small>{ok ? permTags(r.permissions).join(" · ") : <span className="rp-lk"><PaperIcon name="lock" />Ranked at or above your role</span>}</small>
              </span>
              {tick}
            </button>
          );
        })}
        {matches.length === 0 && <p className="rp-none">No role called “{q.trim()}”.</p>}
      </>
    );
    const n = rolesOf(p.id).length;
    summary = n ? <><b>{firstName(p.name)}</b> holds {n} {n === 1 ? "role" : "roles"}</> : `${firstName(p.name)} has no role yet`;
  }

  const title = role ? `Who's ${/^[aeiou]/i.test(role.name) ? "an" : "a"} ${role.name}?` : person!.name;

  return (
    <Modal ariaLabel={title} onClose={onClose} hideHeader maxWidthClass="max-w-[460px]" accent="sky">
      <div className="rp-pick" style={accent ? { "--rc": accent } as React.CSSProperties : undefined}>
        <div className="rp-pick-head">
          {role
            ? <span className="rs-chip" style={{ "--rc": accent } as React.CSSProperties}><span>{role.name}</span></span>
            : <span className="rp-pick-k">Roles</span>}
          <h2 className="rp-pick-t">
            {person && <HolderAvatar id={person.id} name={person.name} url={person.avatarUrl} size={34} />}
            {title}
          </h2>
          <p className="rp-pick-sub">
            {role ? `Tap to add or remove. They'll get: ${permTags(role.permissions).join(", ").toLowerCase()}.` : "Tap a role to give it or take it away."}
          </p>
          <label className="rp-search">
            <PaperIcon name="search" />
            <input
              type="search" className="edt-bare" value={q} onChange={e => setQ(e.target.value)} autoFocus autoComplete="off"
              placeholder={role ? "Search the roster" : "Search roles"} aria-label={role ? "Search the roster" : "Search roles"}
            />
          </label>
        </div>
        <div className="rp-pick-list" role="listbox" aria-multiselectable="true" aria-label={title}>{list}</div>
        <div className="rp-pick-foot">
          <span className="rp-pick-sum">{summary}</span>
          <button type="button" className="rp-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
