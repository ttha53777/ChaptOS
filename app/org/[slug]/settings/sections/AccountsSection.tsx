"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../../context/ChapterContext";
import { useOrgPath } from "../../../../hooks/useOrgPath";
import { LeaveOrgModal } from "../../../../components/LeaveOrgModal";
import { DeleteAccountModal } from "../../../../components/DeleteAccountModal";
import { PaperIcon } from "../../../../components/paper/PaperIcon";
import { requestJson } from "../../../../lib/api";
import { avatarDisplayUrl } from "@/lib/avatar";
import { orgInitials } from "@/lib/org-initials";
import type { Permission } from "@/lib/permissions";
import { Face } from "./accounts/Face";
import { PersonSheet, type SheetPowers } from "./accounts/PersonSheet";
import {
  PERM_GROUPS, TIERS, listJoin, permLabel, permsOf, tierOf, firstName,
  type AccountRow, type RoleInfo,
} from "./accounts/access";
import "./accounts/accounts.css";

// Settings → Accounts: who's in, and what each of them can change. Built from
// _design/Accounts Settings Paper Mock.html; it replaced the row-per-member
// list with inline role chips and admin/delete buttons.
//
// Rows stay quiet (name, roles, what they can change in words) and every edit
// lives in the PersonSheet. "By area" flips the question to: for each page, who
// can change it. Both need role permission bits, which /api/roles only sends to
// MANAGE_ROLES holders — everyone else gets the person view without them.
//
// Same endpoints and gates as before: rename = MANAGE_BROTHERS or yourself,
// admin = currentUser.isAdmin (mirrors PATCH /api/auth/accounts/:id), roles =
// MANAGE_ROLES below your rank, remove = MANAGE_BROTHERS and not yourself.

type Toast = { msg: string; undo?: () => void; key: number };

export function AccountsSection({
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, can, brotherList, avatarRevision, refreshChapterData } = useChapter();
  const orgPath = useOrgPath();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"person" | "area">("person");
  const [q, setQ] = useState("");
  const [area, setArea] = useState<Permission | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const powers: SheetPowers = {
    manage: can("MANAGE_BROTHERS"),
    admin: currentUser?.isAdmin ?? false,
    roles: can("MANAGE_ROLES"),
    maxRank: currentUser?.maxRank ?? 0,
  };
  const orgName = currentUser?.org?.name ?? "this chapter";

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requestJson<AccountRow[]>("/api/auth/accounts"),
      requestJson<RoleInfo[]>("/api/roles").catch(() => [] as RoleInfo[]),
    ])
      .then(([a, r]) => { if (!cancelled) { setAccounts(a); setRoles(r); } })
      .catch(() => { if (!cancelled) onError("Could not load account list."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onError]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const say = useCallback((msg: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, undo, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 4500 : 2800);
  }, []);
  const fail = useCallback((err: unknown, fallback: string) => {
    onError(err instanceof Error ? err.message : fallback);
  }, [onError]);

  const roleMap = useMemo(() => new Map(roles.map(r => [r.id, r])), [roles]);
  const permsKnown = roles.every(r => r.permissions !== undefined);
  const holders = useMemo(() => {
    const m = new Map<number, AccountRow[]>();
    for (const a of accounts) for (const r of a.roles) m.set(r.id, [...(m.get(r.id) ?? []), a]);
    return m;
  }, [accounts]);
  const avatars = useMemo(() => new Map(brotherList.map(b => [b.id, b.avatarUrl ?? null])), [brotherList]);
  const faceSrc = (a: AccountRow) => a.isSelf
    ? avatarDisplayUrl(currentUser?.avatarUrl ?? avatars.get(a.id) ?? null, avatarRevision)
    : avatarDisplayUrl(avatars.get(a.id) ?? null, 0);

  const patch = (id: number, fn: (a: AccountRow) => AccountRow) =>
    setAccounts(prev => prev.map(a => a.id === id ? fn(a) : a));

  // ── Writes ─────────────────────────────────────────────────────────────────
  async function rename(a: AccountRow, name: string, quiet = false): Promise<boolean> {
    try {
      // Renames this org's roster row only (Membership.name).
      const updated = await requestJson<{ name: string }>(`/api/brothers/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const old = a.name;
      setAccounts(prev => prev
        .map(x => x.id === a.id ? { ...x, name: updated.name } : x)
        .sort((x, y) => x.name.localeCompare(y.name)));
      if (!quiet) say(`Renamed to ${updated.name}`, () => void rename({ ...a, name: updated.name }, old, true));
      void refreshChapterData();
      return true;
    } catch (err) {
      fail(err, "Failed to rename member.");
      return false;
    }
  }

  async function setAdmin(a: AccountRow, isAdmin: boolean) {
    try {
      await requestJson(`/api/auth/accounts/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin }),
      });
      patch(a.id, x => ({ ...x, isAdmin }));
      say(isAdmin ? `${firstName(a.name)} is now an admin` : `${firstName(a.name)} is no longer an admin`);
    } catch (err) {
      fail(err, "Failed to update admin status.");
    }
  }

  async function toggleRole(a: AccountRow, role: RoleInfo, give: boolean, quiet = false) {
    try {
      if (give) {
        await requestJson(`/api/brothers/${a.id}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: role.id }),
        });
      } else {
        await requestJson(`/api/brothers/${a.id}/roles/${role.id}`, { method: "DELETE" });
      }
      const chip = { id: role.id, name: role.name, color: role.color, rank: role.rank };
      patch(a.id, x => ({
        ...x,
        // Idempotent: a double click must never draw the same chip twice.
        roles: give
          ? (x.roles.some(r => r.id === role.id) ? x.roles : [...x.roles, chip].sort((m, n) => n.rank - m.rank))
          : x.roles.filter(r => r.id !== role.id),
      }));
      if (!quiet) {
        say(give ? `${firstName(a.name)} is now ${role.name}` : `${firstName(a.name)} is no longer ${role.name}`,
          () => void toggleRole(a, role, !give, true));
      }
    } catch (err) {
      fail(err, give ? "Failed to grant role." : "Failed to revoke role.");
    }
  }

  async function remove(a: AccountRow): Promise<boolean> {
    try {
      await requestJson(`/api/brothers/${a.id}`, { method: "DELETE" });
      setOpenId(null);
      setAccounts(prev => prev.filter(x => x.id !== a.id));
      say(`${a.name} was removed from ${orgName}`);
      void refreshChapterData();
      return true;
    } catch (err) {
      fail(err, "Failed to remove member.");
      return false;
    }
  }

  if (loading) return <div className="ac-page"><div className="ac-loading">Loading…</div></div>;

  const self = accounts.find(a => a.isSelf);
  const open = accounts.find(a => a.id === openId) ?? null;
  const showAreas = permsKnown && view === "area";

  const needle = q.trim().toLowerCase();
  const matches = (a: AccountRow) => {
    if (area) { const p = permsOf(a, roleMap); if (!p?.includes(area)) return false; }
    if (!needle) return true;
    return a.name.toLowerCase().includes(needle)
      || (a.email ?? "").toLowerCase().includes(needle)
      || a.roles.some(r => r.name.toLowerCase().includes(needle));
  };

  const canLine = (a: AccountRow) => {
    if (a.isAdmin) return <span className="ac-can all"><PaperIcon name="key" className="ac-ic" /><span>Everything</span></span>;
    const p = permsOf(a, roleMap);
    if (p === null) return <span className="ac-can" />;
    if (!p.length) return <span className="ac-can view"><PaperIcon name="eye" className="ac-ic" /><span>Can view</span></span>;
    const labels = p.map(permLabel);
    return (
      <span className="ac-can" title={labels.join(", ")}>
        <PaperIcon name="star" className="ac-ic" />
        <span>{labels.slice(0, 2).join(", ")}{labels.length > 2 ? ` +${labels.length - 2}` : ""}</span>
      </span>
    );
  };

  const chips = (a: AccountRow) => a.roles.length
    ? a.roles.map(r => (
        <span key={r.id} className="ac-chip" style={{ "--rc": r.color ?? "#94A3B8" } as React.CSSProperties}><i />{r.name}</span>
      ))
    : <span className="ac-chip none">{a.isAdmin ? "No role" : a.role || "Member"}</span>;

  // ── By person ──────────────────────────────────────────────────────────────
  const groups = TIERS
    .map(t => ({ t, list: accounts.filter(a => tierOf(a) === t.id && matches(a)) }))
    .filter(g => g.list.length);

  const byPerson = groups.length === 0 ? (
    <div className="ac-roster"><div className="ac-empty"><b>Nobody matches</b>Try a different name, or clear the filter.</div></div>
  ) : groups.map(({ t, list }) => (
    <div key={t.id}>
      <div className="ac-grp-h" style={{ "--s": t.tint } as React.CSSProperties}><i />{t.title}<span>{list.length}</span></div>
      <div className="ac-roster">
        {list.map(a => (
          <button key={a.id} type="button" className="ac-row" onClick={() => setOpenId(a.id)}>
            <Face name={a.name} src={faceSrc(a)} admin={a.isAdmin} />
            <span className="ac-who">
              <b><span className="ac-nm">{a.name}</span>{a.isSelf && <span className="ac-you">You</span>}</b>
              <small>{a.linked ? a.email ?? "" : "Can't sign in"}</small>
            </span>
            <span className="ac-chips">{chips(a)}</span>
            {canLine(a)}
            <PaperIcon name="chev-r" className="ac-ic ac-chev" />
          </button>
        ))}
      </div>
    </div>
  ));

  // ── By area ────────────────────────────────────────────────────────────────
  const unheld = roles.filter(r => !(holders.get(r.id)?.length) && (r.permissions ?? 0) !== 0);
  const byArea = (
    <>
      {unheld.length > 0 && (
        <div className="ac-nudge">
          <PaperIcon name="alert" className="ac-ic" />
          <p>
            <b>{listJoin(unheld.map(r => r.name))}</b> {unheld.length === 1 ? "has nobody in it" : "have nobody in them"}, so
            only admins can do {unheld.length === 1 ? "that job" : "those jobs"} right now.
            {powers.roles ? " Open someone below and tick the role to hand it over." : ""}
          </p>
        </div>
      )}
      <div className="ac-areas">
        {PERM_GROUPS.map(g => (
          <div key={g.label} className="ac-agrp" style={{ "--t": `var(--pp-${g.tone})`, "--ts": `var(--pp-${g.tone}-soft)` } as React.CSSProperties}>
            <div className="ac-agrp-h"><i />{g.label}</div>
            {g.perms.map(k => {
              const who = accounts.filter(a => !a.isAdmin && (permsOf(a, roleMap) ?? []).includes(k));
              return (
                <button
                  key={k}
                  type="button"
                  className={`ac-arow${who.length ? "" : " gap"}`}
                  title={`See who can change ${permLabel(k)}`}
                  onClick={() => { setArea(k); setQ(""); setView("person"); }}
                >
                  <span className="ac-lbl">{permLabel(k)}</span>
                  <span className="ac-names">{who.length ? who.map(a => a.name).join(", ") : "Only admins"}</span>
                  <span className="ac-pile">
                    {who.slice(0, 4).map(a => <Face key={a.id} name={a.name} src={faceSrc(a)} size={24} />)}
                    {who.length > 4 && <span className="ac-more">+{who.length - 4}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="ac-legend">
        <span><PaperIcon name="key" className="ac-ic lk" />Admins can also change every page</span>
        <span><i className="ac-dot" />Nobody but an admin can change this</span>
      </div>
    </>
  );

  // ── Your account ───────────────────────────────────────────────────────────
  const memberships = currentUser?.memberships ?? [];
  const orgTag = (m: (typeof memberships)[number], hit: boolean) => (
    <span key={m.organizationId} className={`ac-org${hit ? " hit" : " miss"}`}>
      <span className="ac-org-m">
        {m.orgLogoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={m.orgLogoUrl} alt="" />
          : orgInitials(m.orgName)}
      </span>
      <span>{m.orgName}</span>
    </span>
  );

  return (
    <div className="ac-page">
      <div className="ac-listbar">
        {permsKnown && (
          <div className="ac-views" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "person"} onClick={() => setView("person")}>
              <PaperIcon name="people" className="ac-ic" />By person
            </button>
            <button type="button" aria-pressed={view === "area"} onClick={() => setView("area")}>
              <PaperIcon name="board" className="ac-ic" />By area
            </button>
          </div>
        )}
        {!showAreas && (
          <label className="ac-search">
            <PaperIcon name="search" className="ac-ic" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find someone by name, email or role" autoComplete="off" />
          </label>
        )}
        {area && !showAreas && (
          <span className="ac-filter">
            Can change {permLabel(area)}
            <button type="button" onClick={() => setArea(null)} aria-label="Clear filter"><PaperIcon name="x" className="ac-ic" /></button>
          </span>
        )}
      </div>

      {showAreas ? byArea : byPerson}

      {currentUser?.org && (
        <section className="ac-mine" aria-labelledby="ac-mine-h">
          <h3 className="ac-mine-h" id="ac-mine-h">Your account</h3>
          <p className="ac-mine-sub">
            {(currentUser.email || self?.email) ? `Signed in as ${currentUser.email || self?.email} with Google. ` : ""}
            Two ways out, and they&apos;re very different.
          </p>
          <div className="ac-exits">
            <div className="ac-exit">
              <div className="ac-exit-top">
                <span className="ac-exit-ic"><PaperIcon name="out" className="ac-ic" /></span>
                <h4>Leave this chapter</h4>
              </div>
              <div className="ac-scope">
                <span className="ac-scope-k">Affects</span>
                {memberships.map(m => orgTag(m, m.organizationId === currentUser.orgId))}
              </div>
              <p>You lose access here right away. Your records stay with the chapter, and an officer can invite you back.</p>
              <button className="ac-btn sm gold" type="button" onClick={() => setLeaving(true)}>Leave {orgName}…</button>
            </div>
            <div className="ac-exit del">
              <div className="ac-exit-top">
                <span className="ac-exit-ic"><PaperIcon name="trash" className="ac-ic" /></span>
                <h4>Delete my account</h4>
              </div>
              <div className="ac-scope">
                <span className="ac-scope-k">Affects</span>
                {memberships.map(m => orgTag(m, true))}
              </div>
              <p>Your login is gone and you leave every chapter. Your history is erased; money you paid stays on the books without your name. No undo.</p>
              <button className="ac-btn sm rose" type="button" onClick={() => setDeletingAccount(true)}>Delete my account…</button>
            </div>
          </div>
        </section>
      )}

      {open && (
        <PersonSheet
          key={open.id}
          person={open}
          roles={roles}
          roleMap={roleMap}
          holders={holders}
          powers={powers}
          avatarUrl={faceSrc(open)}
          orgName={orgName}
          archiveHref={orgPath("/brothers")}
          onRename={name => rename(open, name)}
          onSetAdmin={next => setAdmin(open, next)}
          onToggleRole={(role, give) => toggleRole(open, role, give)}
          onRemove={() => remove(open)}
          onClose={() => setOpenId(null)}
        />
      )}

      {toast && (
        <div key={toast.key} className="ac-toast" role="status">
          <PaperIcon name="check" className="ac-ic" />
          <span>{toast.msg}</span>
          {toast.undo && (
            <button type="button" onClick={() => { toast.undo!(); setToast(null); }}>Undo</button>
          )}
        </div>
      )}

      {leaving && currentUser?.org && (
        <LeaveOrgModal
          orgName={currentUser.org.name}
          orgSlug={currentUser.org.slug}
          memberships={currentUser.memberships}
          activeOrgId={currentUser.orgId}
          onClose={() => setLeaving(false)}
          onError={onError}
        />
      )}
      {deletingAccount && <DeleteAccountModal onClose={() => setDeletingAccount(false)} onError={onError} />}
    </div>
  );
}
