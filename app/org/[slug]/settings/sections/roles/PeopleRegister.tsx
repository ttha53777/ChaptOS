import React, { useMemo, useState } from "react";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";
import { HolderAvatar } from "./HolderAvatar";
import { roleColor, type Person } from "./holders";
import type { RoleRow } from "./role-copy";

type Filter = "all" | "some" | "none";

/**
 * By person: the roster, each row with the roles that person holds. Same pairs
 * as the cards, read the other way — the place to answer "what does Sam do?"
 * and to spot who has nothing yet.
 */
export function PeopleRegister({
  people, rolesOf, editable, canGrantAny, query, onAdd, onRemove,
}: {
  people: Person[];
  rolesOf: (personId: number) => RoleRow[];
  editable: (r: RoleRow) => boolean;
  /** False when every role is out of the viewer's reach: no "Role" buttons then. */
  canGrantAny: boolean;
  query: string;
  onAdd: (personId: number) => void;
  onRemove: (roleId: number, person: Person) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const q = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const some = people.filter(p => rolesOf(p.id).length > 0).length;
    return { all: people.length, some, none: people.length - some };
  }, [people, rolesOf]);

  // Highest role first, so officers lead and the no-role people collect at the end.
  const rows = people
    .filter(p => filter === "all" || (filter === "some") === (rolesOf(p.id).length > 0))
    .filter(p => !q || p.name.toLowerCase().includes(q) || rolesOf(p.id).some(r => r.name.toLowerCase().includes(q)))
    .map(p => ({ p, roles: rolesOf(p.id) }))
    .sort((a, b) => (b.roles[0]?.rank ?? -1) - (a.roles[0]?.rank ?? -1) || a.p.name.localeCompare(b.p.name));

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "Everyone" }, { id: "some", label: "Has a role" }, { id: "none", label: "No role" },
  ];

  return (
    <div className="rp-people">
      <div className="rp-filters" role="group" aria-label="Show">
        {FILTERS.map(f => (
          <button key={f.id} type="button" className="rp-fpill" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} <b>{counts[f.id]}</b>
          </button>
        ))}
      </div>
      <div className="rp-register">
        {rows.map(({ p, roles }) => (
          <div key={p.id} className="rp-prow">
            <div className="rp-who">
              <HolderAvatar id={p.id} name={p.name} url={p.avatarUrl} size={34} />
              <div className="rp-who-tx">
                <b>{p.name}{p.isSelf ? " · You" : ""}</b>
                <small>{p.isAdmin ? "Org admin · full access" : roles.length ? `${roles.length} ${roles.length === 1 ? "role" : "roles"}` : "Member"}</small>
              </div>
            </div>
            <div className="rp-chips">
              {roles.map(r => {
                const ok = editable(r);
                return (
                  <span key={r.id} className={`rs-chip rp-chip${ok ? "" : " fixed"}`} style={{ "--rc": roleColor(r) } as React.CSSProperties}>
                    <span>{r.name}</span>
                    {ok && (
                      <button type="button" className="rp-chip-x" onClick={() => onRemove(r.id, p)} aria-label={`Take ${r.name} from ${p.name}`}>
                        <PaperIcon name="x" />
                      </button>
                    )}
                  </span>
                );
              })}
              {roles.length === 0 && <span className="rp-norole">No role</span>}
              {canGrantAny && (
                <button type="button" className="rp-add-pill" onClick={() => onAdd(p.id)} aria-haspopup="dialog">
                  <span className="rp-plus"><PaperIcon name="plus" /></span>
                  {roles.length ? "Role" : "Give a role"}
                </button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="rp-none">{q ? `No one matches “${query.trim()}”.` : "No one here."}</p>}
      </div>
    </div>
  );
}
