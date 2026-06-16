"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { LeaveOrgModal } from "../../../components/LeaveOrgModal";
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
  const router = useRouter();
  const { currentUser } = useChapter();
  const isAdmin = currentUser?.isAdmin ?? false;
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState<number | null>(null);
  const [unlinkingSelf, setUnlinkingSelf] = useState(false);
  const [confirmSelfUnlink, setConfirmSelfUnlink] = useState(false);
  // Admin promote/demote confirm dialog target.
  const [adminTarget, setAdminTarget] = useState<{ id: number; name: string; nextIsAdmin: boolean } | null>(null);
  const [togglingAdmin, setTogglingAdmin] = useState<number | null>(null);

  useEffect(() => {
    requestJson<AccountRow[]>("/api/auth/accounts")
      .then(setAccounts)
      .catch(() => onError("Could not load account list."))
      .finally(() => setLoading(false));
  }, [onError]);

  async function unlink(id: number, name: string) {
    setUnlinking(id);
    try {
      await requestJson(`/api/auth/accounts/${id}`, { method: "DELETE" });
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, linked: false } : a));
      onStatus(`Unlinked Google account from ${name}.`);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to unlink account.");
    } finally {
      setUnlinking(null);
    }
  }

  async function unlinkSelf() {
    setUnlinkingSelf(true);
    try {
      await requestJson("/api/auth/unlink-self", { method: "DELETE" });
      router.push("/login");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to unlink your account. Try again.");
      setUnlinkingSelf(false);
    }
  }

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

  const linked = accounts.filter(a => a.linked);
  const unlinked = accounts.filter(a => !a.linked);

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
      {confirmSelfUnlink && (
        <ConfirmDialog
          title="Unlink your account"
          confirmLabel="Unlink & sign out"
          tone="dusk"
          message={
            <>
              This will remove your Google account from your brother profile and sign you out.
              You&apos;ll need to sign in again and re-link your name to regain access.
            </>
          }
          onCancel={() => setConfirmSelfUnlink(false)}
          onConfirm={() => { setConfirmSelfUnlink(false); unlinkSelf(); }}
        />
      )}
      {adminTarget && (
        <ConfirmDialog
          title={adminTarget.nextIsAdmin ? "Promote to admin" : "Remove admin"}
          confirmLabel={adminTarget.nextIsAdmin ? "Promote" : "Remove admin"}
          tone="dusk"
          message={
            adminTarget.nextIsAdmin ? (
              <>
                Grant <span className="font-semibold" style={{ color: "var(--ink)" }}>{adminTarget.name}</span> admin permissions?
                They will be able to manage finances, semesters, roster, and attendance.
              </>
            ) : (
              <>
                Remove admin permissions from <span className="font-semibold" style={{ color: "var(--ink)" }}>{adminTarget.name}</span>?
                They will lose access to financial and destructive actions.
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
      <p className="sc-lede" style={{ margin: 0 }}>
        Manage which brothers have linked their Google account. Unlink removes their access until they claim again.
      </p>

      {accounts.length === 0 ? (
        <div className="sc-empty"><div className="t">No brothers found</div></div>
      ) : (
        <div className="sc-stack-tight">
          {linked.length > 0 && (
            <div>
              <p className="sc-grp-label">Linked — {linked.length}</p>
              <div className="sc-card">
                {linked.map((a) => (
                  <div key={a.id} className="sc-row sc-row-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--ok)" }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="sc-row-key truncate">{a.name}</span>
                          {a.isSelf && <span className="sc-pill sc-pill-muted">You</span>}
                          {a.isAdmin && <span className="sc-pill sc-pill-vio">Admin</span>}
                        </div>
                        <p className="sc-row-sub">{a.role || "Member"}</p>
                        {a.email && <p className="sc-row-sub truncate" title={a.email}>{a.email}</p>}
                        <BrotherRoleChips brotherId={a.id} initialRoles={a.roles} onError={onError} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isAdmin && !a.isSelf && adminBtn(a)}
                      {a.isSelf ? (
                        <button
                          onClick={() => setConfirmSelfUnlink(true)}
                          disabled={unlinkingSelf}
                          className="sc-btn sc-btn-sm shrink-0"
                          style={{ background: "var(--gold-bg)", color: "var(--gold)", borderColor: "rgba(221,179,106,.25)" }}
                        >
                          {unlinkingSelf ? "Unlinking…" : "Unlink my account"}
                        </button>
                      ) : isAdmin ? (
                        <button
                          onClick={() => unlink(a.id, a.name)}
                          disabled={unlinking === a.id}
                          className="sc-btn sc-btn-danger sc-btn-sm shrink-0"
                        >
                          {unlinking === a.id ? "Unlinking…" : "Unlink"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unlinked.length > 0 && (
            <div>
              <p className="sc-grp-label">Not linked — {unlinked.length}</p>
              <div className="sc-card">
                {unlinked.map((a) => (
                  <div key={a.id} className="sc-row sc-row-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--faint)" }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px]" style={{ color: "var(--muted)" }}>{a.name}</span>
                          {a.isAdmin && <span className="sc-pill sc-pill-vio">Admin</span>}
                        </div>
                        <p className="sc-row-sub">{a.role || "Member"}</p>
                        <BrotherRoleChips brotherId={a.id} initialRoles={a.roles} onError={onError} />
                      </div>
                    </div>
                    {isAdmin && adminBtn(a)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <LeaveOrgZone onError={onError} />
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

