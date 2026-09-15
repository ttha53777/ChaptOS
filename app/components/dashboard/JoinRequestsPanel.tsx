"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChapter } from "../../context/ChapterContext";
import { inputDuskCls, btnDuskActionCls, btnDuskGhostCls } from "./styles";
import { Modal, ConfirmDialog } from "./primitives";
import { ApiError, apiErrorCode, apiErrorMessage, requestJson } from "../../lib/api";
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
  inviteId: number;
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
  memberWord, maxRank, onApproved, onSeatWall, onStatus,
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
  const { currentUser, setPendingJoinRequestCountLocal } = useChapter();
  const orgSlug = currentUser?.org?.slug;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [rolesError, setRolesError] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [inviteFilter, setInviteFilter] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("inviteId") ?? "");
  const [nextCursor, setNextCursor] = useState<{ afterDate: string; afterId: number } | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [seatAvailable, setSeatAvailable] = useState(true);
  const generation = useRef(0);
  const mutation = useRef(false);
  const [rows, setRows]       = useState<JoinRequestRow[]>([]);
  const [loaded, setLoaded]   = useState(false);
  const [roles, setRoles]     = useState<RoleOption[]>([]);
  const [review, setReview]   = useState<JoinRequestRow | null>(null);
  const [roleId, setRoleId]   = useState<number | null>(null);
  const [busy, setBusy]       = useState(false);
  const [rejectTarget, setRejectTarget] = useState<JoinRequestRow | null>(null);

  const refresh = useCallback(async (cursor?: { afterDate: string; afterId: number }) => {
    const revision = ++generation.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: "1", search });
      if (inviteFilter) qs.set("inviteId", inviteFilter);
      if (cursor) { qs.set("afterDate", cursor.afterDate); qs.set("afterId", String(cursor.afterId)); }
      const data = await requestJson<{ rows: JoinRequestRow[]; total: number; pendingTotal: number; nextCursor: typeof nextCursor; seats: { allowed: boolean } }>(`/api/join-requests?${qs}`);
      if (generation.current !== revision) return;
      setRows(rs => cursor ? [...rs, ...data.rows.filter(r => !rs.some(existing => existing.id === r.id))] : data.rows);
      setTotal(data.total);
      setNextCursor(data.nextCursor);
      setSeatAvailable(data.seats.allowed);
      if (orgSlug) setPendingJoinRequestCountLocal(data.pendingTotal, orgSlug);
      setLoadError(null);
    } catch {
      if (generation.current === revision) setLoadError("Couldn't load join requests. Try again.");
    } finally {
      if (generation.current === revision) { setLoaded(true); setLoading(false); }
    }
  }, [search, inviteFilter, orgSlug, setPendingJoinRequestCountLocal]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 250);
    const onFocus = () => { if (!mutation.current) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(timer); generation.current++; window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    setRolesError(false);
    try { setRoles(await requestJson<RoleOption[]>("/api/roles")); }
    catch { setRolesError(true); }
    finally { setRolesLoading(false); }
  }, []);
  useEffect(() => { if (review) void loadRoles(); }, [review, loadRoles]);

  function openReview(row: JoinRequestRow) {
    setDecisionError(null);
    setReview(row);
    setRoleId(null);
  }

  async function approve() {
    if (!review || mutation.current) return;
    mutation.current = true;
    setDecisionError(null);
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
      void refresh();
    } catch (e) {
      // 402 → the org has outgrown its plan. That isn't an error to retry, it's
      // a state with one specific way out, so it goes to the page's seat wall
      // rather than the generic error band.
      const wall = seatWallFrom(e);
      if (wall) { onSeatWall(wall); setReview(null); }
      else if (e instanceof ApiError && e.status === 409) {
        if (apiErrorCode(e) === "JOIN_REQUEST_DECIDED") {
          setReview(null);
          onStatus("Already reviewed by another officer. The queue has been refreshed.");
        } else setDecisionError(apiErrorMessage(e, "Couldn't approve this request. Refresh the queue."));
        void refresh();
      } else setDecisionError(apiErrorMessage(e, "Couldn't approve this request. Try again."));
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  async function reject(row: JoinRequestRow) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setDecisionError(null);
    setRejectTarget(null);
    try {
      await requestJson(`/api/join-requests/${row.id}/reject`, { method: "POST" });
      onStatus(`Declined ${row.name}'s request.`);
      setRows(rs => rs.filter(r => r.id !== row.id));
      setReview(null);
      void refresh();
    } catch (e) {
      if (apiErrorCode(e) === "JOIN_REQUEST_DECIDED") {
        setReview(null);
        onStatus("Already reviewed by another officer. The queue has been refreshed.");
      } else setDecisionError(apiErrorMessage(e, "Couldn't decline this request. Try again."));
      if (e instanceof ApiError && e.status === 409) void refresh();
    } finally { mutation.current = false; setBusy(false); }
  }

  // Nothing waiting → nothing to say.
  if (!loaded) return <p className="jr-note" role="status">Loading join requests…</p>;
  if (!loadError && rows.length === 0 && !search && !inviteFilter && !review) return null;

  // Strictly below, matching canGrantRank server-side: a Treasurer must not be
  // able to mint another Treasurer through the approval dialog.
  const grantable = roles.filter(r => r.rank < maxRank);

  return (
    <>
      <section id="join-requests" className="jr-band" aria-label={`${total} people waiting to join`}>
        <div className="jr-head">
          <span className="jr-dot" aria-hidden />
          <h2 className="jr-title">
            {total === 1
              ? `1 person is waiting to join`
              : `${total} people are waiting to join`}
          </h2>
          <span className="jr-sub">They can&rsquo;t see anything until you approve them.</span>
        </div>

        <div className="jr-tools">
          <input className={inputDuskCls} aria-label="Search join requests" placeholder="Search name or email" value={search} onChange={e => setSearch(e.target.value)} />
          {inviteFilter && <button className={btnDuskGhostCls} onClick={() => setInviteFilter("")}>Show all invite links</button>}
          <button className={btnDuskGhostCls} disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
        {loadError && <div role="alert" className="jr-error">{loadError} <button onClick={() => void refresh()}>Retry</button></div>}
        {!loadError && rows.length === 0 && <p className="jr-note">No requests match this filter.</p>}
        {!seatAvailable && total > 0 && <p className="jr-note">Adding another member needs a billing update. You can still review requests.</p>}
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

              <button className="btn primary jr-review" disabled={busy} onClick={() => openReview(row)}>
                Review
              </button>
            </li>
          ))}
        </ul>
        {nextCursor && <button className={btnDuskGhostCls} disabled={loading} onClick={() => void refresh(nextCursor)}>Load more requests</button>}
      </section>

      {review && (
        <Modal title={`Approve ${review.name}?`} tone="dusk" onClose={() => (busy ? undefined : setReview(null))}>
          <div className="space-y-4 jr-review-dialog">
            {decisionError && <div role="alert" className="jr-error">{decisionError}</div>}
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
              <label className="jr-label" htmlFor="jr-role">Role</label>
              <select
                id="jr-role"
                disabled={busy || rolesLoading || rolesError}
                className={inputDuskCls}
                value={roleId ?? ""}
                onChange={(e) => setRoleId(e.target.value === "" ? null : Number(e.target.value))}
                style={{ width: "100%" }}
              >
                <option value="">No role — just a {memberWord}</option>
                {grantable.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {rolesLoading && <p role="status" className="jr-note">Loading roles…</p>}
              {rolesError && <p role="alert" className="jr-note">Couldn't load roles. <button className="auth-link vio" onClick={() => void loadRoles()}>Retry</button> You can still approve without a role.</p>}
              <p className="text-[12px] leading-relaxed text-[#958d7c]" style={{ marginTop: 8 }}>
                A role carries real permissions. You can only hand out roles ranked
                below your own, and you can change this later from the roster.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                className={`${btnDuskGhostCls} text-rose-300`}
                disabled={busy}
                onClick={() => setRejectTarget(review)}
              >
                Decline
              </button>
              <div className="flex items-center gap-2">
                <button className={btnDuskGhostCls} disabled={busy} onClick={() => setReview(null)}>
                  Cancel
                </button>
                <button className={btnDuskActionCls} disabled={busy} onClick={approve}>
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
