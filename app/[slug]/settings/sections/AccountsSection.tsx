"use client";

import React, { useState, useEffect } from "react";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { LeaveOrgModal } from "../../../components/LeaveOrgModal";
import { DeleteAccountModal } from "../../../components/DeleteAccountModal";
import { BrotherRoleChips } from "./BrotherRoleChips";
import { requestJson } from "../../../lib/api";

interface AssignedRoleSummary {
  id: number;
  name: string;
  color: string | null;
  rank: number;
}

interface AccountRow {
  id: number;
  name: string;
  role: string;
  linked: boolean;
  isSelf: boolean;
  isAdmin: boolean;
  email: string | null;
  roles: AssignedRoleSummary[];
}

export function AccountsSection({
  onStatus, onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, can, refreshChapterData } = useChapter();
  const isAdmin = currentUser?.isAdmin ?? false;
  const canManage = can("MANAGE_BROTHERS");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Admin promote/demote confirm dialog target.
  const [adminTarget, setAdminTarget] = useState<{ id: number; name: string; nextIsAdmin: boolean } | null>(null);
  const [togglingAdmin, setTogglingAdmin] = useState<number | null>(null);
  // Inline rename: one row at a time.
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  // Delete confirm dialog target.
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    requestJson<AccountRow[]>("/api/auth/accounts")
      .then(setAccounts)
      .catch(() => onError("Could not load account list."))
      .finally(() => setLoading(false));
  }, [onError]);

  async function toggleAdmin(target: { id: number; name: string; nextIsAdmin: boolean }) {
    setTogglingAdmin(target.id);
    try {
      await requestJson(`/api/auth/accounts/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: target.nextIsAdmin }),
      });
      setAccounts(prev => prev.map(a => a.id === target.id ? { ...a, isAdmin: target.nextIsAdmin } : a));
      onStatus(target.nextIsAdmin ? `${target.name} is now an admin.` : `${target.name} is no longer an admin.`);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to update admin status.");
    } finally {
      setTogglingAdmin(null);
    }
  }

  async function saveName() {
    if (!editing) return;
    const name = editing.draft.trim();
    const current = accounts.find(a => a.id === editing.id);
    if (!name || name === current?.name) { setEditing(null); return; }
    setSavingName(true);
    try {
      // Renames this org's roster row only (Membership.name) — other chapters
      // keep whatever they call this person.
      const updated = await requestJson<{ name: string }>(`/api/brothers/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setAccounts(prev => prev
        .map(a => a.id === editing.id ? { ...a, name: updated.name } : a)
        .sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
      onStatus(`Renamed to ${updated.name}.`);
      void refreshChapterData();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to rename member.");
    } finally {
      setSavingName(false);
    }
  }

  async function deleteMember(target: { id: number; name: string }) {
    setDeleting(target.id);
    try {
      await requestJson(`/api/brothers/${target.id}`, { method: "DELETE" });
      setAccounts(prev => prev.filter(a => a.id !== target.id));
      onStatus(`${target.name} was removed from the org.`);
      void refreshChapterData();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to remove member.");
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <div className="py-8 text-center sc-note">Loading…</div>;

  const adminBtn = (a: AccountRow) => (
    <button
      onClick={() => setAdminTarget({ id: a.id, name: a.name, nextIsAdmin: !a.isAdmin })}
      disabled={togglingAdmin === a.id}
      className={`sc-btn sc-btn-sm shrink-0 ${a.isAdmin ? "sc-btn-ghost" : "sc-btn-accent"}`}
    >
      {togglingAdmin === a.id ? "Saving…" : a.isAdmin ? "Remove admin" : "Make admin"}
    </button>
  );

  return (
    <div className="sc-stack-tight">
      {adminTarget && (
        <ConfirmDialog
          title={adminTarget.nextIsAdmin ? "Promote to admin" : "Remove admin"}
          confirmLabel={adminTarget.nextIsAdmin ? "Promote" : "Remove admin"}
          tone="dusk"
          message={
            adminTarget.nextIsAdmin ? (
              <>
                Make <span className="font-semibold" style={{ color: "var(--ink)" }}>{adminTarget.name}</span> an admin of this org?
                They get every permission here regardless of their roles, plus billing.
              </>
            ) : (
              <>
                Remove admin from <span className="font-semibold" style={{ color: "var(--ink)" }}>{adminTarget.name}</span>?
                They keep only what their roles grant.
              </>
            )
          }
          onCancel={() => setAdminTarget(null)}
          onConfirm={() => {
            const t = adminTarget;
            setAdminTarget(null);
            void toggleAdmin(t);
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete member"
          confirmLabel="Delete"
          tone="dusk"
          message={
            <>
              Remove <span className="font-semibold" style={{ color: "var(--ink)" }}>{deleteTarget.name}</span>{" "}
              from this org? Their attendance, dues, service and role records here are erased; ledger
              transactions stay on the books. This can&apos;t be undone. To keep their history,
              archive them from the roster instead.
            </>
          }
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const t = deleteTarget;
            setDeleteTarget(null);
            void deleteMember(t);
          }}
        />
      )}
      <p className="sc-lede" style={{ margin: 0 }}>
        Everyone on the roster and the roles they hold. What each role can do is set in Roles;
        admins have full access regardless of roles.
      </p>

      {accounts.length === 0 ? (
        <div className="sc-empty"><div className="t">No members found</div></div>
      ) : (
        <div>
          <p className="sc-grp-label">Members — {accounts.length}</p>
          <div className="sc-card">
            {accounts.map((a) => (
              <div key={a.id} className="sc-row sc-row-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {editing?.id === a.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={e => { e.preventDefault(); void saveName(); }}
                      >
                        <input
                          autoFocus
                          className="sc-input sc-input-sm"
                          value={editing.draft}
                          maxLength={80}
                          disabled={savingName}
                          aria-label={`New name for ${a.name}`}
                          onChange={e => setEditing({ id: a.id, draft: e.target.value })}
                          onKeyDown={e => { if (e.key === "Escape") setEditing(null); }}
                        />
                        <button type="submit" disabled={savingName || !editing.draft.trim()} className="sc-btn sc-btn-sm sc-btn-accent">
                          {savingName ? "Saving…" : "Save"}
                        </button>
                        <button type="button" disabled={savingName} onClick={() => setEditing(null)} className="sc-btn sc-btn-sm sc-btn-ghost">
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="sc-row-key truncate">{a.name}</span>
                        {(canManage || a.isSelf) && (
                          <button
                            type="button"
                            onClick={() => setEditing({ id: a.id, draft: a.name })}
                            className="sc-btn sc-btn-sm sc-btn-ghost shrink-0"
                            title="Edit name"
                            aria-label={`Edit name for ${a.name}`}
                          >
                            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 8 17l.464-4.536z" />
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                    {a.isSelf && <span className="sc-pill sc-pill-muted">You</span>}
                    {a.isAdmin && <span className="sc-pill sc-pill-vio">Admin</span>}
                    {!a.linked && (
                      <span className="sc-pill sc-pill-muted" title="No Google account is attached to this member">
                        Can&apos;t sign in
                      </span>
                    )}
                  </div>
                  {/* Roles are the title. The free-text one only shows for
                      members holding none, matching roleTitle() on the roster. */}
                  {a.roles.length === 0 && <p className="sc-row-sub">{a.role || "Member"}</p>}
                  {a.email && <p className="sc-row-sub truncate" title={a.email}>{a.email}</p>}
                  <BrotherRoleChips brotherId={a.id} initialRoles={a.roles} onError={onError} />
                </div>
                {!a.isSelf && (isAdmin || canManage) && (
                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin && adminBtn(a)}
                    {canManage && (
                      <button
                        onClick={() => setDeleteTarget({ id: a.id, name: a.name })}
                        disabled={deleting === a.id}
                        className="sc-btn sc-btn-sm sc-btn-danger"
                      >
                        {deleting === a.id ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <LeaveOrgZone onError={onError} />
      <DeleteAccountZone onError={onError} />
    </div>
  );
}

// ─── Leave organization ─────────────────────────────────────────────────────
// Self-serve "disconnect from this org" for any member (not admin-gated). Mirrors
// the DangerZone delete flow — type the org name to confirm — but in a neutral
// amber tone since it's reversible (the user can be re-invited) and only affects
// the caller, not the whole org.

function LeaveOrgZone({ onError }: { onError: (msg: string) => void }) {
  const { currentUser } = useChapter();
  const [open, setOpen] = useState(false);

  if (!currentUser?.org) return null;

  return (
    <>
      <div className="rounded-xl p-4" style={{ border: "1px solid var(--gold-bg)", background: "var(--gold-bg)" }}>
        <h3 className="sc-h" style={{ color: "var(--gold)" }}>Leave organization</h3>
        <p className="sc-note mt-1 mb-3">
          Disconnect yourself from <span style={{ color: "var(--ink-soft)" }}>{currentUser.org.name}</span>.
          You&apos;ll lose access immediately. Your data stays with the org and you can be re-invited later.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="sc-btn sc-btn-sm"
          style={{ background: "var(--gold-bg)", color: "var(--gold)", borderColor: "rgba(221,179,106,.3)" }}
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Leave this organization
        </button>
      </div>

      {open && (
        <LeaveOrgModal
          orgName={currentUser.org.name}
          orgSlug={currentUser.org.slug}
          memberships={currentUser.memberships}
          activeOrgId={currentUser.orgId}
          onClose={() => setOpen(false)}
          onError={onError}
        />
      )}
    </>
  );
}


// ─── Delete account ─────────────────────────────────────────────────────────
// Self-serve erasure of the whole account, across every org — the irreversible
// sibling of Leave organization, so rose rather than amber. The modal asks the
// server what's blocking it before offering the confirm field.

function DeleteAccountZone({ onError }: { onError: (msg: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl p-4" style={{ border: "1px solid var(--rose-bg)", background: "var(--rose-bg)" }}>
        <h3 className="sc-h" style={{ color: "var(--rose)" }}>Delete account</h3>
        <p className="sc-note mt-1 mb-3">
          Permanently delete your login and remove yourself from every organization you&apos;re in.
          Your history is erased; money you paid stays on the books without your name. This cannot be undone.
        </p>
        <button onClick={() => setOpen(true)} className="sc-btn sc-btn-sm sc-btn-danger">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete my account
        </button>
      </div>

      {open && <DeleteAccountModal onClose={() => setOpen(false)} onError={onError} />}
    </>
  );
}
