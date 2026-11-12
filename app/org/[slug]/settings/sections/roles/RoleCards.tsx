import React from "react";
import { PaperIcon } from "../../../../../components/paper/PaperIcon";
import { HolderAvatar } from "./HolderAvatar";
import { permTags, roleColor, type Person } from "./holders";
import type { RoleRow } from "./role-copy";

/**
 * By role: every role is an index card — tinted header with the pages it opens
 * and a tally, then one holder per ruled line, then a blank dashed line to add
 * the next. Roles at or above the viewer's rank carry a stamp and no controls,
 * because the server would refuse the grant/revoke anyway.
 */
export function RoleCards({
  roles, holdersOf, rolesOf, editable, query, freshId, flashId,
  onAdd, onRemove, onOpen, onNew,
}: {
  roles: RoleRow[];
  holdersOf: (roleId: number) => Person[];
  rolesOf: (personId: number) => RoleRow[];
  editable: (r: RoleRow) => boolean;
  query: string;
  freshId: number | null;
  /** The card that just gained someone; it pulses once. */
  flashId: number | null;
  onAdd: (roleId: number) => void;
  onRemove: (roleId: number, person: Person) => void;
  onOpen: (r: RoleRow) => void;
  onNew: () => void;
}) {
  const q = query.trim().toLowerCase();
  const shown = q
    ? roles.filter(r => r.name.toLowerCase().includes(q) || holdersOf(r.id).some(p => p.name.toLowerCase().includes(q)))
    : roles;

  return (
    <>
      <div className="rp-cards">
        {shown.map(r => {
          const holders = holdersOf(r.id);
          const ok = editable(r);
          return (
            <article
              key={r.id}
              className={`rp-card${ok ? "" : " locked"}${flashId === r.id ? " flash" : ""}`}
              style={{ "--rc": roleColor(r) } as React.CSSProperties}
            >
              <span className="rp-tape" aria-hidden />
              <header className="rp-card-head">
                <div className="rp-card-id">
                  <button type="button" className="rp-card-name" onClick={() => onOpen(r)} aria-haspopup="dialog">
                    <span>{r.name}</span>
                    <PaperIcon name="chev-r" />
                  </button>
                  <div className="rp-perms">
                    {freshId === r.id && <span className="rp-new">New</span>}
                    {permTags(r.permissions).map(t => <span key={t} className="rp-perm">{t}</span>)}
                  </div>
                </div>
                {ok
                  ? (
                    <span className={`rp-tally${holders.length ? "" : " zero"}`}>
                      <b>{holders.length}</b>
                      <small>{holders.length === 1 ? "person" : "people"}</small>
                    </span>
                  ) : (
                    <span className="rp-stamp" title="You can only hand out roles ranked below yours">
                      <PaperIcon name="lock" />
                      <span className="long">Above your rank</span>
                      <span className="short">Locked</span>
                    </span>
                  )}
              </header>
              <ol className="rp-lines">
                {holders.length === 0 && (
                  <li className="rp-line empty"><span className="rp-no">—</span><span className="rp-line-tx">Nobody has this role yet.</span></li>
                )}
                {holders.map((p, i) => {
                  const others = rolesOf(p.id).filter(x => x.id !== r.id).map(x => x.name);
                  return (
                    <li key={p.id} className="rp-line">
                      <span className="rp-no">{String(i + 1).padStart(2, "0")}</span>
                      <HolderAvatar id={p.id} name={p.name} url={p.avatarUrl} />
                      <span className="rp-line-tx">
                        <b>{p.name}</b>
                        <small>{others.length ? `Also ${others.join(", ")}` : "Just this role"}</small>
                      </span>
                      {p.isSelf && <span className="rp-you">You</span>}
                      {ok && (
                        <button type="button" className="rp-x" onClick={() => onRemove(r.id, p)} aria-label={`Take ${r.name} from ${p.name}`}>
                          <PaperIcon name="x" />
                        </button>
                      )}
                    </li>
                  );
                })}
                {ok && (
                  <li className="rp-line add">
                    <span className="rp-no" />
                    <button type="button" className="rp-add-line" onClick={() => onAdd(r.id)} aria-haspopup="dialog">
                      <span className="rp-plus"><PaperIcon name="plus" /></span>
                      {holders.length ? "Add someone else" : "Give it to someone"}
                    </button>
                  </li>
                )}
              </ol>
            </article>
          );
        })}
        {!q && (
          <button type="button" className="rp-new-card" onClick={onNew} aria-haspopup="dialog">
            <span className="rp-plus big"><PaperIcon name="plus" /></span>
            New role
            <small>Pick what it can do, then who holds it</small>
          </button>
        )}
      </div>
      {q && shown.length === 0 && <p className="rp-none">No role or person matches “{query.trim()}”.</p>}
    </>
  );
}
