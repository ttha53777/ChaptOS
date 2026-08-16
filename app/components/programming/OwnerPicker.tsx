"use client";

/**
 * Picking an event's owner — a PERSON or a ROLE, never both.
 *
 * Owner is what Planning costs. An idea belongs to the chapter; a plan belongs
 * to somebody, and this is the control that says who. Until this existed the
 * board asked for an owner in three places and offered no way to give it one.
 *
 * The two modes are not cosmetic. A person owner is a fact about today ("Maya is
 * running this one"); a role owner is a standing duty ("mixers belong to the
 * Social Chair") that survives the officer turning over, because the stored
 * value is the role id and the holders resolve at read time. The avatars encode
 * that difference in their SHAPE — a circle is a face, a rounded square is a
 * title — so a role is never misread as a person at a glance.
 *
 * The value is read back through the resolved `owner` DTO, but written as a bare
 * FK: the service nulls the sibling column itself, and the Zod schema refuses a
 * payload carrying both.
 */

import { useEffect, useState } from "react";
import type { Brother } from "../../data";
import { roleTitle } from "../../data";
import { initialsOf, ownerInitials, type OwnerRef } from "@/lib/event-owner";

export interface RoleOption {
  id: number;
  name: string;
  color?: string | null;
  memberCount?: number;
}

export type OwnerPatch =
  | { ownerBrotherId: number | null }
  | { ownerRoleId: number | null };

type Mode = "person" | "role";

/**
 * The avatar that appears wherever an owner does.
 *
 * `none` is a dashed circle holding "?" rather than an empty slot — an unowned
 * event is a gap the board is actively asking you to close, and a blank space
 * reads as "nothing here" instead of "something missing".
 */
export function OwnerAvatar({ owner, size = 26 }: { owner: OwnerRef; size?: number }) {
  const cls =
    !owner ? "ev-av none"
    : owner.kind === "role" ? "ev-av role"
    : "ev-av";
  return (
    <span className={cls} style={{ width: size, height: size }} aria-hidden>
      {ownerInitials(owner)}
    </span>
  );
}

export function OwnerPicker({
  value,
  brothers,
  roles,
  disabled,
  onChange,
}: {
  value: OwnerRef;
  brothers: Brother[];
  roles: RoleOption[];
  disabled?: boolean;
  onChange: (patch: OwnerPatch) => void;
}) {
  // Land on the tab that matches what the event already has, so re-opening a
  // role-owned event doesn't silently present the Person grid as if the role
  // owner weren't there.
  const [mode, setMode] = useState<Mode>(value?.kind === "role" ? "role" : "person");
  const ownerKey = value ? `${value.kind}:${value.id}` : "none";
  useEffect(() => {
    setMode(value?.kind === "role" ? "role" : "person");
  }, [ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ev-ownpick">
      {/* Switching tabs is a display change, not an edit — it must never commit. */}
      <div className="ev-ownpick-tabs" role="tablist" aria-label="Owner kind">
        {(["person", "role"] as const).map(m => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={disabled}
            onClick={() => setMode(m)}
            className={mode === m ? "on" : undefined}
          >
            {m === "person" ? "Person" : "Role"}
          </button>
        ))}
        {value && !disabled && (
          <button
            type="button"
            className="ev-ownpick-clear"
            onClick={() =>
              onChange(value.kind === "role" ? { ownerRoleId: null } : { ownerBrotherId: null })
            }
          >
            Unassign
          </button>
        )}
      </div>

      {mode === "person" ? (
        <div className="ev-ownpick-grid" role="group" aria-label="Roster">
          {brothers.length === 0 && <p className="ev-ownpick-empty">Nobody on the roster yet.</p>}
          {brothers.map(b => {
            const on = value?.kind === "brother" && value.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                className={`ev-ownpick-opt${on ? " on" : ""}`}
                onClick={() => onChange({ ownerBrotherId: on ? null : b.id })}
              >
                <span className="ev-av" aria-hidden>{initialsOf(b.name)}</span>
                <span className="ev-ownpick-txt">
                  <b>{b.name}</b>
                  <i>{roleTitle(b)}</i>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="ev-ownpick-grid" role="group" aria-label="Roles">
          {roles.length === 0 && <p className="ev-ownpick-empty">This chapter has no roles yet.</p>}
          {roles.map(r => {
            const on = value?.kind === "role" && value.id === r.id;
            const held = r.memberCount ?? 0;
            return (
              <button
                key={r.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                className={`ev-ownpick-opt${on ? " on" : ""}`}
                onClick={() => onChange({ ownerRoleId: on ? null : r.id })}
              >
                <span className="ev-av role" aria-hidden>
                  {ownerInitials({ kind: "role", id: r.id, name: r.name, holders: [] })}
                </span>
                <span className="ev-ownpick-txt">
                  <b>{r.name}</b>
                  {/* An unheld duty is still a real owner — say so plainly rather
                      than hiding the row or implying it's unassignable. */}
                  <i>{held === 0 ? "nobody holds it now" : `${held} now`}</i>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
