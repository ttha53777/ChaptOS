"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal, ConfirmDialog } from "./primitives";
import { requestJson } from "../../lib/api";
import { seatWallFrom, type SeatWall } from "../../lib/seat-wall";

/**
 * The review queue: people who opened an invite link and are waiting to be let in.
 *
 * Lives on the roster because approving one WRITES a roster row — it's gated on
 * MANAGE_BROTHERS, not the MANAGE_SETTINGS bit that mints the links, and an
 * officer deciding "is this really our new treasurer?" wants the roster in front
 * of them. Renders nothing when the queue is empty, so the roster is unchanged
 * for orgs with nobody waiting.
 */

export interface JoinRequestRow {
  id:          number;
  name:        string;
  email:       string | null;
  avatarUrl:   string | null;
  createdAt:   string;
  inviteLabel: string | null;
}

interface RoleOption {
  id:   number;
  name: string;
  rank: number;
}

/** "2h ago" / "3d ago" — how long someone has been kept waiting, at a glance. */
function waitedFor(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1)    return "just now";
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function JoinRequestsPanel({
  memberWord, maxRank, onApproved, onSeatWall, onError, onStatus,
}: {
  /** Vocab-aware noun ("member", "brother") for the copy. */
  memberWord: string;
  /** The reviewer's own highest rank — bounds which roles they may hand out. */
  maxRank: number;
  /** Fired after a successful approval so the roster can refetch. */
  onApproved: () => void;
  /** The org is out of seats — hand the wall up to the page, which renders it. */
  onSeatWall: (wall: SeatWall) => void;
  onError:  (msg: string) => void;
  onStatus: (msg: string) => void;
}) {
  const [rows, setRows]       = useState<JoinRequestRow[]>([]);
  const [loaded, setLoaded]   = useState(false);
  const [roles, setRoles]     = useState<RoleOption[]>([]);
  const [review, setReview]   = useState<JoinRequestRow | null>(null);
  const [roleId, setRoleId]   = useState<number | null>(null);
  const [busy, setBusy]       = useState(false);
  const [rejectTarget, setRejectTarget] = useState<JoinRequestRow | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await requestJson<JoinRequestRow[]>("/api/join-requests"));
    } catch {
      // Silent: this is an additive band, not roster data. A failure here must
      // not blank the page an officer came to use.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Roles for the approve picker. /api/roles returns `rank` to every caller, so
  // the list can be narrowed to what this officer may actually grant before it
  // is ever shown — the server re-checks the same rule (canGrantRank) on submit,
  // this just avoids offering a choice that would 403.
  useEffect(() => {
    if (!review || roles.length > 0) return;
    requestJson<RoleOption[]>("/api/roles").then(setRoles).catch(() => setRoles([]));
  }, [review, roles.length]);

  function openReview(row: JoinRequestRow) {
    setReview(row);
    setRoleId(null);
  }

  async function approve() {
    if (!review) return;
    setBusy(true);
    try {
      await requestJson(`/api/join-requests/${review.id}/approve`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ roleId }),
      });
      onStatus(`${review.name} is now on the roster.`);
      setRows(rs => rs.filter(r => r.id !== review.id));
      setReview(null);
      onApproved();
    } catch (e) {
      // 402 → the org has outgrown its plan. That isn't an error to retry, it's
      // a state with one specific way out, so it goes to the page's seat wall
      // rather than the generic error band.
      const wall = seatWallFrom(e);
      if (wall) { onSeatWall(wall); setReview(null); }
      else onError(e instanceof Error ? e.message : "Couldn't approve this request");
    } finally {
      setBusy(false);
    }
  }

  async function reject(row: JoinRequestRow) {
    setRejectTarget(null);
    try {
      await requestJson(`/api/join-requests/${row.id}/reject`, { method: "POST" });
      onStatus(`Declined ${row.name}'s request.`);
      setRows(rs => rs.filter(r => r.id !== row.id));
      setReview(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't decline this request");
    }
  }

  // Nothing waiting → nothing to say.
  if (!loaded || rows.length === 0) return null;

  // Strictly below, matching canGrantRank server-side: a Treasurer must not be
  // able to mint another Treasurer through the approval dialog.
  const grantable = roles.filter(r => r.rank < maxRank);

  return (
    <>
      <section className="jr-band" aria-label={`${rows.length} people waiting to join`}>
        <div className="jr-head">
          <span className="jr-dot" aria-hidden />
          <h2 className="jr-title">
            {rows.length === 1
              ? `1 person is waiting to join`
              : `${rows.length} people are waiting to join`}
          </h2>
          <span className="jr-sub">They can&rsquo;t see anything until you approve them.</span>
        </div>

        <ul className="jr-list">
          {rows.map(row => (
            <li key={row.id} className="jr-row">
              {row.avatarUrl
                ? <img className="jr-av" src={row.avatarUrl} alt="" />
                : <span className="jr-av jr-av-fb" aria-hidden>{row.name.trim().charAt(0).toUpperCase()}</span>}

              <span className="jr-who">
                <span className="jr-name">{row.name}</span>
                {row.email && <span className="jr-mail" title={row.email}>{row.email}</span>}
              </span>

              <span className="jr-meta">
                {row.inviteLabel && <span className="jr-chip">{row.inviteLabel}</span>}
                <span className="jr-when">{waitedFor(row.createdAt)}</span>
              </span>

              <button className="btn primary jr-review" onClick={() => openReview(row)}>
                Review
              </button>
            </li>
          ))}
        </ul>
      </section>

      {review && (
        <Modal title={`Add ${review.name}?`} tone="dusk" onClose={() => (busy ? undefined : setReview(null))}>
          <div className="space-y-4">
            <div className="jr-modal-id">
              {review.avatarUrl
                ? <img className="jr-av" src={review.avatarUrl} alt="" />
                : <span className="jr-av jr-av-fb" aria-hidden>{review.name.trim().charAt(0).toUpperCase()}</span>}
              <div>
                <div className="jr-name">{review.name}</div>
                <div className="jr-mail">{review.email ?? "no email on their account"}</div>
              </div>
            </div>

            <p className="text-[13px] leading-relaxed text-[#c9c2b4]">
              Approving creates their spot on the roster and lets them in
              immediately. They&rsquo;ll start with no dues, no attendance and no
              recorded hours.
            </p>

            <div>
              <label className="auth-label" htmlFor="jr-role">Role</label>
              <select
                id="jr-role"
                className="sc-select"
                value={roleId ?? ""}
                onChange={(e) => setRoleId(e.target.value === "" ? null : Number(e.target.value))}
                style={{ width: "100%" }}
              >
                <option value="">No role — just a {memberWord}</option>
                {grantable.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="text-[12px] leading-relaxed text-[#958d7c]" style={{ marginTop: 8 }}>
                A role carries real permissions. You can only hand out roles ranked
                below your own, and you can change this later from the roster.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                className="sc-btn sc-btn-danger"
                disabled={busy}
                onClick={() => setRejectTarget(review)}
              >
                Decline
              </button>
              <div className="flex items-center gap-2">
                <button className="sc-btn sc-btn-ghost" disabled={busy} onClick={() => setReview(null)}>
                  Cancel
                </button>
                <button className="sc-btn sc-btn-primary" disabled={busy} onClick={approve}>
                  {busy ? "Adding…" : "Approve"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {rejectTarget && (
        <ConfirmDialog
          title={`Decline ${rejectTarget.name}?`}
          message={
            <>
              They&rsquo;ll be told the request wasn&rsquo;t approved, and{" "}
              <b>this link will stop working for them</b>. If you change your mind,
              send them a new invite link and they can ask again.
            </>
          }
          confirmLabel="Decline"
          tone="dusk"
          onConfirm={() => reject(rejectTarget)}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </>
  );
}
