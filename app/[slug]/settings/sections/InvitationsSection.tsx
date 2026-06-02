"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { INVITE_EXPIRY_PRESETS, type InviteExpiry } from "@/lib/validation/invite";
import type { InviteMode } from "@/lib/state";

interface InviteRow {
  id: number;
  token: string;
  mode: InviteMode;
  expiresAt: string | null;
  createdAt: string;
  redemptionCount: number;
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

const EXPIRY_LABELS: Record<InviteExpiry, string> = {
  "20m":   "20 minutes",
  "1d":    "1 day",
  "7d":    "7 days",
  "14d":   "14 days",
  "never": "Never",
};

const MODE_HELP: Record<InviteMode, string> = {
  open:  "Anyone who opens the link signs in and joins as a new member.",
  claim: "Invitees sign in, then link to their existing name on the roster.",
};

function joinUrl(token: string): string {
  if (typeof window === "undefined") return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "Never expires";
  const d = new Date(iso);
  if (d.getTime() <= Date.now()) return "Expired";
  return `Expires ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

export function InvitationsSection({
  onStatus, onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { can } = useChapter();
  const canManage = can("MANAGE_SETTINGS");

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]       = useState<InviteMode>("open");
  const [expiry, setExpiry]   = useState<InviteExpiry>("7d");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await requestJson<InviteRow[]>("/api/invites");
      setInvites(rows);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to load invites");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Defense-in-depth: the tab is already hidden when the user lacks the
  // permission, but render nothing if it's somehow reached.
  if (!canManage) return null;

  async function handleCreate() {
    setCreating(true);
    try {
      await requestJson<InviteRow>("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, expiry }),
      });
      onStatus("Invite link created");
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to create invite");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(row: InviteRow) {
    try {
      await navigator.clipboard.writeText(joinUrl(row.token));
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(c => (c === row.id ? null : c)), 2000);
    } catch {
      onError("Couldn't copy to clipboard");
    }
  }

  async function doRevoke(row: InviteRow) {
    setRevokeTarget(null);
    try {
      await requestJson(`/api/invites/${row.id}`, { method: "DELETE" });
      onStatus("Invite link revoked");
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to revoke invite");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-[16px] font-semibold text-white">Invite links</h2>
        <p className="text-[12px] text-white/45">
          Generate a link to invite people to your organization. Links stay active
          until they expire or you revoke them.
        </p>
      </header>

      {/* Generate form */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-white/70">Link type</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as InviteMode)}
              className="rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-2 text-[13px] text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="open">Open join (new member)</option>
              <option value="claim">Claim roster name</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-white/70">Expires after</span>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as InviteExpiry)}
              className="rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-2 text-[13px] text-white focus:border-indigo-500 focus:outline-none"
            >
              {INVITE_EXPIRY_PRESETS.map(p => (
                <option key={p} value={p}>{EXPIRY_LABELS[p]}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-white/40">{MODE_HELP[mode]}</p>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Generating…" : "Generate link"}
        </button>
      </div>

      {/* Active links */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-widest text-white/30">Active links</h3>
        {loading ? (
          <p className="text-[12px] text-white/40">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="text-[12px] text-white/40">No active invite links. Generate one above.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map(row => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${
                    row.mode === "open"
                      ? "bg-indigo-500/15 text-indigo-200"
                      : "bg-amber-500/15 text-amber-200"
                  }`}>
                    {row.mode === "open" ? "Open join" : "Claim"}
                  </span>
                  <span className="text-[11px] text-white/40">{formatExpiry(row.expiresAt)}</span>
                  <span className="ml-auto text-[11px] text-white/40">
                    {row.redemptionCount} {row.redemptionCount === 1 ? "join" : "joins"}
                  </span>
                </div>
                <div className="flex items-stretch gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.06] bg-zinc-900/80 px-3 py-2 text-[12px] text-white/70">
                    {joinUrl(row.token)}
                  </code>
                  <button
                    onClick={() => copyLink(row)}
                    className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/[0.08]"
                  >
                    {copiedId === row.id ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={() => setRevokeTarget(row)}
                    className="shrink-0 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 text-[12px] font-medium text-red-300 transition-colors hover:bg-red-500/[0.12]"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {revokeTarget && (
        <ConfirmDialog
          title="Revoke this invite link?"
          message={
            revokeTarget.redemptionCount > 0
              ? `${revokeTarget.redemptionCount} ${revokeTarget.redemptionCount === 1 ? "person has" : "people have"} already joined — they keep their access. The link will stop working immediately.`
              : "The link will stop working immediately. This cannot be undone."
          }
          confirmLabel="Revoke"
          onConfirm={() => doRevoke(revokeTarget)}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}
