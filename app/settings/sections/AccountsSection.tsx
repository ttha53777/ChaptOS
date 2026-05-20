"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "../../components/dashboard/primitives";
import { useChapter } from "../../context/ChapterContext";

interface AccountRow {
  id: number;
  name: string;
  role: string;
  linked: boolean;
  isSelf: boolean;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch { /* ignore */ }
    throw new Error(`${url} returned ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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

  const linked = accounts.filter(a => a.linked);
  const unlinked = accounts.filter(a => !a.linked);

  if (loading) return <div className="py-8 text-center text-[11px] text-slate-600">Loading…</div>;

  return (
    <div className="space-y-6">
      {confirmSelfUnlink && (
        <ConfirmDialog
          title="Unlink your account"
          confirmLabel="Unlink & sign out"
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
      <p className="text-[12px] text-slate-500">
        Manage which brothers have linked their Google account. Unlink removes their access until they claim again.
      </p>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] py-8 text-center text-[11px] text-slate-600">No brothers found.</div>
      ) : (
        <div className="space-y-3">
          {linked.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Linked — {linked.length}</p>
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                {linked.map((a, i) => (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${i < linked.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-slate-200">{a.name}</span>
                          {a.isSelf && (
                            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">you</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600">{a.role || "Member"}</p>
                      </div>
                    </div>
                    {a.isSelf ? (
                      <button
                        onClick={() => setConfirmSelfUnlink(true)}
                        disabled={unlinkingSelf}
                        className="shrink-0 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-1.5 text-[11px] font-medium text-amber-400 transition-all hover:bg-amber-500/15 disabled:opacity-40"
                      >
                        {unlinkingSelf ? "Unlinking…" : "Unlink my account"}
                      </button>
                    ) : isAdmin ? (
                      <button
                        onClick={() => unlink(a.id, a.name)}
                        disabled={unlinking === a.id}
                        className="shrink-0 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-1.5 text-[11px] font-medium text-red-400 transition-all hover:bg-red-500/15 disabled:opacity-40"
                      >
                        {unlinking === a.id ? "Unlinking…" : "Unlink"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {unlinked.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Not linked — {unlinked.length}</p>
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                {unlinked.map((a, i) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-2.5 px-4 py-3 ${i < unlinked.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                  >
                    <div className="h-2 w-2 shrink-0 rounded-full bg-slate-700" />
                    <div className="min-w-0">
                      <span className="truncate text-[13px] text-slate-500">{a.name}</span>
                      <p className="text-[11px] text-slate-700">{a.role || "Member"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
