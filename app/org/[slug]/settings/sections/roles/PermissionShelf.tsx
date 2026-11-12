"use client";

import React, { useState } from "react";
import { PERMISSIONS, PERMISSION_LIST, type Permission } from "@/lib/permissions";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";
import { PERM_GROUPS, PERM_META, andList, bitsOf, permLabel } from "./role-copy";

/**
 * Every permission as a page tile on a shelf per group. Off = "Can see" (what
 * everyone already has), on = "Can change". One line under each group either
 * sums the group up or, while a tile is hovered/focused, says what it unlocks.
 * Bits the actor doesn't hold are locked: the server refuses to grant them.
 */
export function PermissionShelf({ bits, onChange, canGrant, readOnly, roleLabel }: {
  bits: number;
  onChange: (bits: number) => void;
  canGrant: (p: Permission) => boolean;
  readOnly?: boolean;
  roleLabel: string;
}) {
  const [hover, setHover] = useState<Permission | null>(null);
  const [popped, setPopped] = useState<Permission | null>(null);
  const held = PERMISSION_LIST.filter(p => (bits & p.bit) !== 0).length;

  function toggle(p: Permission) {
    const bit = PERMISSIONS[p];
    const next = bits ^ bit;
    setPopped(next & bit ? p : null);
    onChange(next);
  }

  function line(perms: Permission[]): React.ReactNode {
    if (hover && perms.includes(hover)) {
      const m = PERM_META[hover];
      const on = (bits & PERMISSIONS[hover]) !== 0;
      const locked = !readOnly && !canGrant(hover);
      return (
        <>
          <b>{permLabel(hover)}</b>
          <span className={on ? "rs-on" : "rs-off"}>{on ? "Can change" : "Can see"}</span>
          <span>{locked ? `You don't hold ${permLabel(hover)} yourself, so you can't hand it out.` : `${m.desc}.`}</span>
          {m.big && <span className="rs-big">Big one</span>}
        </>
      );
    }
    const on = perms.filter(p => (bits & PERMISSIONS[p]) !== 0).map(permLabel);
    if (on.length === 0) return <span>None picked. {roleLabel} can see these pages but not change them.</span>;
    if (on.length === perms.length && perms.length > 1) return <span>{roleLabel} can change <b>all of these</b>.</span>;
    return <span>{roleLabel} can change <b>{andList(on)}</b>.</span>;
  }

  return (
    <div onMouseLeave={() => setHover(null)}>
      <div className="rs-legend">
        <div className="rs-lg"><span className="rs-spec see"><PaperIcon name="eye" /></span><span><b>Can see</b>Everyone, already</span></div>
        <span className="rs-lg-arrow" aria-hidden="true">→</span>
        <div className="rs-lg"><span className="rs-spec chg"><PaperIcon name="pencil" /></span><span><b>Can change</b>Add, edit, delete</span></div>
        <div className="rs-lg"><span className="rs-spec big"><i /></span><span><b>Big one</b>Give carefully</span></div>
        <div className="rs-tally" aria-label={`${held} of ${PERMISSION_LIST.length} pages`}>
          <span className="rs-dots" aria-hidden="true">
            {PERMISSION_LIST.map(p => <i key={p.name} className={bits & p.bit ? "on" : ""} />)}
          </span>
          <span>{held} of {PERMISSION_LIST.length}</span>
        </div>
      </div>

      {PERM_GROUPS.map(g => {
        const on = g.perms.filter(p => (bits & PERMISSIONS[p]) !== 0).length;
        const grantable = g.perms.filter(canGrant);
        const gBits = bitsOf(grantable);
        const allOn = grantable.length > 0 && (bits & gBits) === gBits;
        return (
          <div key={g.label} className="rs-shelf" data-tone={g.tone} role="group" aria-label={g.label}>
            <div className="rs-tab">
              <div className="t">{g.label}</div>
              <span className="n">{on} of {g.perms.length}</span>
              {!readOnly && grantable.length > 0 && (
                <button type="button" onClick={() => onChange(allOn ? bits & ~gBits : bits | gBits)}>
                  {allOn ? "Clear" : "Pick all"}
                </button>
              )}
            </div>
            <div className="rs-pgs">
              {g.perms.map(p => {
                const m = PERM_META[p];
                const is = (bits & PERMISSIONS[p]) !== 0;
                const locked = !readOnly && !canGrant(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`rs-pg${popped === p ? " pop" : ""}${locked ? " locked" : ""}`}
                    aria-pressed={is}
                    aria-label={`${permLabel(p)}: ${m.desc}${m.big ? " (big one)" : ""}${locked ? " (you can't hand this out)" : ""}`}
                    disabled={readOnly || locked}
                    onClick={() => toggle(p)}
                    onMouseEnter={() => setHover(p)}
                    onFocus={() => setHover(p)}
                  >
                    {m.big && <span className="rs-bg1" aria-hidden="true" />}
                    <span className="rs-stp" aria-hidden="true"><PaperIcon name={locked ? "lock" : "check"} /></span>
                    <span className="rs-ico"><PaperIcon name={m.icon} /></span>
                    <span className="rs-lb">{m.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="rs-line" aria-live="polite">{line(g.perms)}</div>
          </div>
        );
      })}
    </div>
  );
}
