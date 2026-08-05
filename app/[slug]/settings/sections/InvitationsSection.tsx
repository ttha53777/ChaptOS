"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { useVocab } from "../../../hooks/useVocab";
import { scrollIntoViewSafe } from "../../../lib/scroll";
import { INVITE_EXPIRY_PRESETS, INVITE_LABEL_MAX, type InviteExpiry } from "@/lib/validation/invite";
import type { InviteMode, InviteStatus } from "@/lib/state";
import { requestJson } from "../../../lib/api";

interface InviteRow {
  id: number;
  token: string;
  mode: InviteMode;
  label: string | null;
  maxUses: number | null;
  status: InviteStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  redemptionCount: number;
  createdByName: string | null;
}

interface RedemptionRow {
  brotherId: number;
  name: string;
  redeemedAt: string;
  onRoster: boolean;
}

const EXPIRY_LABELS: Record<InviteExpiry, string> = {
  "20m":   "20 minutes",
  "1d":    "1 day",
  "7d":    "7 days",
  "14d":   "14 days",
  "never": "Never",
};

// The mode question, asked the way an admin actually thinks about it. The old
// labels ("Open join" / "Claim roster name") named the implementation; what the
// admin knows is whether these people are already written down.
const MODE_CARDS: { mode: InviteMode; title: string; body: string }[] = [
  {
    mode:  "open",
    title: "They’re new",
    body:  "Anyone who opens the link signs in and joins as a new member.",
  },
  {
    mode:  "claim",
    title: "They’re already on the roster",
    body:  "Invitees sign in, then link to their existing name on the roster.",
  },
];

const STATUS_PILL: Record<InviteStatus, { label: string; cls: string }> = {
  active:    { label: "Active",    cls: "sc-pill-ok" },
  expired:   { label: "Expired",   cls: "sc-pill-muted" },
  revoked:   { label: "Revoked",   cls: "sc-pill-rose" },
  exhausted: { label: "Full",      cls: "sc-pill-gold" },
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

/** The tick inside `.sc-box`. Matches the one WorkflowsSection draws. */
function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

// This section used to report through the global useToast() because the page's
// status band was in normal flow and its confirmations fire while the admin is
// scrolled down to the links list. The band is sticky now, so it reports the
// same way as every other section — one feedback channel instead of two.
export function InvitationsSection({
  onStatus, onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { can } = useChapter();
  const v = useVocab();
  const canManage = can("MANAGE_SETTINGS");
  const memberWord = v("Member", true).toLowerCase();

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const [mode, setMode]       = useState<InviteMode>("open");
  const [expiry, setExpiry]   = useState<InviteExpiry>("7d");
  const [label, setLabel]     = useState("");
  const [capOn, setCapOn]     = useState(false);
  const [maxUses, setMaxUses] = useState("25");

  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteRow | null>(null);

  // Which row's join list is open, and its contents once fetched. Lazy — most
  // rows are never expanded, so listing every link's redeemers up front would
  // be a query per link for information nobody asked for.
  const [openJoins, setOpenJoins] = useState<number | null>(null);
  const [joins, setJoins] = useState<Record<number, RedemptionRow[] | "loading" | "error">>({});

  // The freshly created row, flashed so the eye lands on it. A new link appends
  // into a list that may already be long, and the confirmation toast alone
  // doesn't say WHICH row is the new one.
  const [flashId, setFlashId] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const refresh = useCallback(async (opts: { includeInactive: boolean }) => {
    setLoading(true);
    try {
      const qs = opts.includeInactive ? "?include=all" : "";
      setInvites(await requestJson<InviteRow[]>(`/api/invites${qs}`));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to load invites");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void refresh({ includeInactive: showInactive }); }, [refresh, showInactive]);

  // Defense-in-depth: the tab is already hidden when the user lacks the
  // permission, but render nothing if it's somehow reached.
  if (!canManage) return null;

  async function handleCreate() {
    const cap = capOn ? Number(maxUses) : undefined;
    if (capOn && (!Number.isInteger(cap) || (cap ?? 0) < 1)) {
      onError("Max uses must be a whole number of 1 or more");
      return;
    }
    setCreating(true);
    try {
      const created = await requestJson<InviteRow>("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, expiry, label: label.trim() || undefined, maxUses: cap }),
      });
      onStatus("Invite link created");
      setLabel("");
      await refresh({ includeInactive: showInactive });
      setFlashId(created.id);
      // After the list re-renders with the new row.
      requestAnimationFrame(() => {
        scrollIntoViewSafe(rowRefs.current.get(created.id), { block: "nearest", behavior: "smooth" });
      });
      setTimeout(() => setFlashId(f => (f === created.id ? null : f)), 2200);
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
      await refresh({ includeInactive: showInactive });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to revoke invite");
    }
  }

  async function toggleJoins(row: InviteRow) {
    if (openJoins === row.id) { setOpenJoins(null); return; }
    setOpenJoins(row.id);
    if (joins[row.id] && joins[row.id] !== "error") return; // already loaded
    setJoins(j => ({ ...j, [row.id]: "loading" }));
    try {
      const rows = await requestJson<RedemptionRow[]>(`/api/invites/${row.id}/redemptions`);
      setJoins(j => ({ ...j, [row.id]: rows }));
    } catch {
      setJoins(j => ({ ...j, [row.id]: "error" }));
    }
  }

  const capWarning = expiry === "never" && !capOn;

  return (
    <div className="sc-stack">
      <p className="sc-lede" style={{ margin: 0 }}>
        Generate a link to invite people to your organization. Links stay active
        until they expire, fill up, or you revoke them.
      </p>

      {/* ── Generate form ── */}
      <div className="sc-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sc-grp-label" style={{ marginBottom: 8 }}>
            Who is this link for?
          </legend>
          <div className="sc-choice-grid">
            {MODE_CARDS.map(card => (
              <label key={card.mode} className={`sc-choice${mode === card.mode ? " on" : ""}`}>
                <input
                  type="radio"
                  name="invite-mode"
                  value={card.mode}
                  checked={mode === card.mode}
                  onChange={() => setMode(card.mode)}
                />
                <span className="t">{card.title}</span>
                <span className="h">{card.body}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium" style={{ color: "var(--ink-soft)" }}>
              Label <span style={{ color: "var(--faint)", fontWeight: 400 }}>(optional)</span>
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={INVITE_LABEL_MAX}
              placeholder="Fall rush"
              className="sc-input"
            />
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

        <div className="flex flex-wrap items-center gap-3">
          <label className="sc-check" style={{ alignItems: "center" }}>
            <input type="checkbox" checked={capOn} onChange={(e) => setCapOn(e.target.checked)} />
            <span aria-hidden className="sc-box" style={{ marginTop: 0 }}><CheckGlyph /></span>
            <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
              Limit how many people can use it
            </span>
          </label>
          {capOn && (
            <input
              type="number"
              min={1}
              max={500}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="sc-input sc-input-num sc-input-sm"
              style={{ width: 84 }}
              aria-label="Maximum uses"
            />
          )}
        </div>

        {/* A link that never expires and admits anyone is the one most likely to
            leak out of a group chat months later. Say so at the moment of choice. */}
        {capWarning && (
          <p className="sc-note" style={{ color: "var(--gold)" }}>
            This link will work forever, for anyone who gets it. Consider an expiry or a use limit.
          </p>
        )}

        <button onClick={handleCreate} disabled={creating} className="sc-btn sc-btn-primary self-start">
          {creating ? "Generating…" : "Generate link"}
        </button>
      </div>

      {/* ── Links ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="sc-grp-label" style={{ margin: 0 }}>
            {showInactive ? "All links" : "Active links"}
          </h3>
          <label className="sc-check" style={{ alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => { setShowInactive(e.target.checked); setOpenJoins(null); }}
            />
            <span aria-hidden className="sc-box" style={{ marginTop: 0 }}><CheckGlyph /></span>
            <span className="sc-note">Show expired &amp; revoked</span>
          </label>
        </div>

        {loading ? (
          <p className="sc-note">Loading…</p>
        ) : invites.length === 0 ? (
          <div className="sc-empty">
            <div className="t">{showInactive ? "No invite links yet" : "No active invite links"}</div>
            <div className="h">Generate one above to start inviting {memberWord}.</div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map(row => {
              const dead = row.status !== "active";
              const pill = STATUS_PILL[row.status];
              return (
                <li
                  key={row.id}
                  ref={el => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); }}
                  className={`sc-card sc-invite-row${flashId === row.id ? " flash" : ""}${dead ? " dead" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`sc-pill ${row.mode === "open" ? "sc-pill-vio" : "sc-pill-gold"}`}>
                      {row.mode === "open" ? "New members" : "Roster claim"}
                    </span>
                    {dead && <span className={`sc-pill ${pill.cls}`}>{pill.label}</span>}
                    <span className="ml-auto sc-note">
                      {row.maxUses != null
                        ? `${row.redemptionCount} / ${row.maxUses} used`
                        : `${row.redemptionCount} ${row.redemptionCount === 1 ? "join" : "joins"}`}
                    </span>
                  </div>

                  {row.label && (
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{row.label}</div>
                  )}

                  {row.maxUses != null && (
                    <div className="sc-meter" aria-hidden>
                      <i style={{ width: `${Math.min(100, (row.redemptionCount / row.maxUses) * 100)}%` }} />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1 sc-note">
                    <span>
                      {row.status === "revoked" && row.revokedAt
                        ? `Revoked ${formatDate(row.revokedAt)}`
                        : formatExpiry(row.expiresAt)}
                    </span>
                    <span>·</span>
                    <span>Created {formatDate(row.createdAt)}</span>
                    {row.createdByName && (
                      <><span>·</span><span>{row.createdByName}</span></>
                    )}
                  </div>

                  {/* A dead link's URL is noise — nobody should copy it. */}
                  {!dead && (
                    <div className="flex items-stretch gap-2">
                      <code
                        className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-[12px]"
                        style={{ border: "1px solid var(--line)", background: "var(--paper-2)", color: "var(--ink-soft)", fontFamily: "var(--mono)" }}
                      >
                        {joinUrl(row.token)}
                      </code>
                      <button
                        onClick={() => copyLink(row)}
                        className="sc-btn sc-btn-ghost shrink-0"
                        aria-live="polite"
                      >
                        {copiedId === row.id ? "Copied" : "Copy"}
                      </button>
                      <button onClick={() => setRevokeTarget(row)} className="sc-btn sc-btn-danger shrink-0">
                        Revoke
                      </button>
                    </div>
                  )}

                  {row.redemptionCount > 0 && (
                    <div>
                      <button
                        onClick={() => toggleJoins(row)}
                        className="sc-btn sc-btn-ghost sc-btn-sm"
                        aria-expanded={openJoins === row.id}
                      >
                        {openJoins === row.id ? "Hide joins" : "View joins"}
                      </button>
                      {openJoins === row.id && (
                        <JoinList state={joins[row.id]} memberWord={memberWord} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
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

/**
 * Who used a link. The "not on roster" chip is the important part: someone who
 * already belonged to another org joins by Membership and never lands on this
 * org's roster, so without this the admin sees the count go up and the roster
 * stay still, with nothing connecting the two.
 */
function JoinList({
  state, memberWord,
}: { state: RedemptionRow[] | "loading" | "error" | undefined; memberWord: string }) {
  if (state === "loading" || state === undefined) return <p className="sc-note" style={{ marginTop: 8 }}>Loading…</p>;
  if (state === "error") return <p className="sc-note" style={{ marginTop: 8, color: "var(--rose)" }}>Couldn&rsquo;t load joins.</p>;
  if (state.length === 0) return <p className="sc-note" style={{ marginTop: 8 }}>No joins yet.</p>;

  return (
    <ul className="sc-joins">
      {state.map(r => (
        <li key={r.brotherId}>
          <span className="n">{r.name}</span>
          {!r.onRoster && (
            <span className="sc-pill sc-pill-muted" title={`Joined from another org, so they don’t appear on this ${memberWord} roster`}>
              not on roster
            </span>
          )}
          <span className="d">{formatDate(r.redeemedAt)}</span>
        </li>
      ))}
    </ul>
  );
}
