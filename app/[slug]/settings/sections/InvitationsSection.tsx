"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { INVITE_EXPIRY_PRESETS, type InviteExpiry } from "@/lib/validation/invite";
import type { InviteMode } from "@/lib/state";
import { requestJson } from "../../../lib/api";

interface InviteRow {
  id: number;
  token: string;
  mode: InviteMode;
  expiresAt: string | null;
  createdAt: string;
  redemptionCount: number;
  createdByName: string | null;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
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
    <div className="sc-stack">
      <p className="sc-lede" style={{ margin: 0 }}>
        Generate a link to invite people to your organization. Links stay active
        until they expire or you revoke them.
      </p>

      {/* Generate form */}
      <div className="sc-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium" style={{ color: "var(--ink-soft)" }}>Link type</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as InviteMode)}
              className="sc-select"
            >
              <option value="open">Open join (new member)</option>
              <option value="claim">Claim roster name</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium" style={{ color: "var(--ink-soft)" }}>Expires after</span>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as InviteExpiry)}
              className="sc-select"
            >
              {INVITE_EXPIRY_PRESETS.map(p => (
                <option key={p} value={p}>{EXPIRY_LABELS[p]}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="sc-note">{MODE_HELP[mode]}</p>
        <button onClick={handleCreate} disabled={creating} className="sc-btn sc-btn-primary self-start">
          {creating ? "Generating…" : "Generate link"}
        </button>
      </div>

      {/* Active links */}
      <div className="flex flex-col gap-2">
        <h3 className="sc-grp-label">Active links</h3>
        {loading ? (
          <p className="sc-note">Loading…</p>
        ) : invites.length === 0 ? (
          <div className="sc-empty">
            <div className="t">No active invite links</div>
            <div className="h">Generate one above to start inviting members.</div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map(row => (
              <li key={row.id} className="sc-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="flex items-center gap-2">
                  <span className={`sc-pill ${row.mode === "open" ? "sc-pill-vio" : "sc-pill-gold"}`}>
                    {row.mode === "open" ? "Open join" : "Claim"}
                  </span>
                  <span className="sc-note">{formatExpiry(row.expiresAt)}</span>
                  <span className="ml-auto sc-note">
                    {row.redemptionCount} {row.redemptionCount === 1 ? "join" : "joins"}
                  </span>
                </div>
                <div className="flex items-center gap-1 sc-note">
                  <span>Created {formatDate(row.createdAt)}</span>
                  {row.createdByName && (
                    <><span>·</span><span>{row.createdByName}</span></>
                  )}
                </div>
                <div className="flex items-stretch gap-2">
                  <code
                    className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-[12px]"
                    style={{ border: "1px solid var(--line)", background: "var(--paper-2)", color: "var(--ink-soft)", fontFamily: "var(--mono)" }}
                  >
                    {joinUrl(row.token)}
                  </code>
                  <button onClick={() => copyLink(row)} className="sc-btn sc-btn-ghost shrink-0">
                    {copiedId === row.id ? "Copied" : "Copy"}
                  </button>
                  <button onClick={() => setRevokeTarget(row)} className="sc-btn sc-btn-danger shrink-0">
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
          tone="dusk"
          onConfirm={() => doRevoke(revokeTarget)}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}
