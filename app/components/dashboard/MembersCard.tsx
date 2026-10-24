"use client";

import React from "react";
import { fmt$, getBrotherStatus, type Brother, type BrotherStatus, type Thresholds } from "../../data";
import { isAttendanceExempt } from "@/lib/thresholds";
import { ALL_TRACKED, type TrackedMetrics } from "@/lib/tracked-metrics";
import type { BuiltinMetricId } from "@/lib/onboarding/kinds";
import { useVocab } from "../../hooks/useVocab";
import { useChapter } from "../../context/ChapterContext";
import { ApiError, apiErrorCode, apiErrorMessage, requestJson } from "../../lib/api";
import { seatWallFrom } from "../../lib/seat-wall";
import { BrotherAvatar } from "../BrotherAvatar";
import { PaperIcon, PaperTile } from "../paper/PaperIcon";
import { SectionError } from "./ledger/SectionError";
import { useToast } from "./Toast";
import type { JoinRequestRow } from "./JoinRequestsPanel";
import "./members-card.css";

/**
 * The dashboard's Members card (_design/Dashboard Universal Paper Mock.html).
 * One card, three moods, decided by what the roster actually holds:
 *
 *   - someone is asking to join (and you can let them in) → the queue leads,
 *     with one-tap Approve; picking a role still lives on the roster page;
 *   - day one (just the founder) → your face, empty seats, and the invite link;
 *   - otherwise → a compressed Standing: the Good / Watch / At-risk bar, faces
 *     worst-first, and the one person most worth a look.
 *
 * Replaces the dashboard roster table. Search, sort and the full register live
 * on /brothers, which the header links to.
 */

type Band = "good" | "watch" | "risk";
const BAND_OF: Record<BrotherStatus, Band> = { "Good": "good", "Watch": "watch", "At Risk": "risk" };
const BANDS: { k: Band; label: string; tone: "mint" | "butter" | "peach" }[] = [
  { k: "good",  label: "Good",    tone: "mint" },
  { k: "watch", label: "Watch",   tone: "butter" },
  { k: "risk",  label: "At risk", tone: "peach" },
];
const RANK: Record<Band, number> = { risk: 0, watch: 1, good: 2 };

/** Faces drawn before the rest collapse into "+N". */
const MAX_FACES = 15;
/** Requests listed before "+ N more". */
const MAX_REQUESTS = 3;
/** Empty seats beside the founder on day one. */
const DAY_ONE_SEATS = 7;

const ALL_TRACKED_KEYS = Object.keys(ALL_TRACKED) as BuiltinMetricId[];

/** How many members sit in each standing band, or null while no tracked metric
 *  can decide a standing yet (the card then shows no bands either). */
export function standingCounts(brothers: Brother[], thresholds: Thresholds, standing: TrackedMetrics): Record<Band, number> | null {
  if (!ALL_TRACKED_KEYS.some(k => standing[k])) return null;
  const c: Record<Band, number> = { good: 0, watch: 0, risk: 0 };
  for (const b of brothers) c[BAND_OF[getBrotherStatus(b, thresholds, standing)]]++;
  return c;
}

const TONES = ["sky", "lilac", "mint", "butter", "peach", "rose"] as const;
/** A stable pastel per name, as the mock's toneOf. */
function toneOf(name: string): (typeof TONES)[number] {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
}

/**
 * Why this member sits in their band, in the same order getBrotherStatus
 * checks — so the reason shown is the one that actually put them there.
 */
function reasonFor(b: Brother, band: Band, t: Thresholds, m: TrackedMetrics, serviceWord: string): string {
  const att = m.attendance && !isAttendanceExempt(b.attendance);
  if (band === "risk") {
    if (att && b.attendance < t.attendanceAtRisk) return `${b.attendance}% attendance`;
    if (m.gpa && b.gpa < t.gpaAtRisk) return `GPA ${b.gpa.toFixed(2)}`;
  }
  if (band === "watch") {
    if (att && b.attendance < t.attendanceWatch) return `${b.attendance}% attendance`;
    if (m.gpa && b.gpa < t.gpaWatch) return `GPA ${b.gpa.toFixed(2)}`;
    if (m.duesOwed && b.duesOwed > 0) return `owes ${fmt$(b.duesOwed)}`;
    if (m.serviceHours && b.serviceHours < t.serviceHoursGoal) return `${b.serviceHours}h of ${serviceWord.toLowerCase()}`;
  }
  return "on track";
}

/** "under 80% attendance, dues owed or GPA under 3.0" — only the measures this org records. */
function ruleLine(t: Thresholds, m: TrackedMetrics, serviceWord: string, duesWord: string): string {
  const parts = [
    m.attendance && `under ${t.attendanceWatch}% attendance`,
    m.duesOwed && `${duesWord.toLowerCase()} owed`,
    m.gpa && `GPA under ${t.gpaWatch.toFixed(1)}`,
    m.serviceHours && `${serviceWord.toLowerCase()} under ${t.serviceHoursGoal}h`,
  ].filter(Boolean) as string[];
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

function sameMonth(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function MembersCard({
  brothers,
  loading,
  error,
  onRetry,
  thresholds,
  tracked = ALL_TRACKED,
  measured,
  selfId,
  selfAvatarUrl,
  avatarRevision,
  onOpenMember,
  onOpenAll,
  canReview,
  onApproved,
  inviteLink,
  canInvite,
  onCopyInvite,
  hideButton,
}: {
  brothers: Brother[];
  loading: boolean;
  error: boolean;
  onRetry?: () => void;
  thresholds: Thresholds;
  tracked?: TrackedMetrics;
  /** Which metrics may decide a STANDING — the tracked set narrowed to those with
   *  at least one record org-wide, so a blank org shows no invented bands. Defaults to `tracked`. */
  measured?: TrackedMetrics;
  selfId: number | null;
  selfAvatarUrl?: string | null;
  avatarRevision: number;
  onOpenMember: (id: number) => void;
  onOpenAll: (hash?: string) => void;
  /** MANAGE_BROTHERS — may see and approve the join queue. */
  canReview: boolean;
  /** Fired after an approval so the roster refetches. */
  onApproved: () => void;
  /** The org's active invite link, when the viewer may see it. */
  inviteLink: string | null;
  /** MANAGE_SETTINGS — may hand out (or go create) a link. */
  canInvite: boolean;
  /** Copies the link, or routes to Settings → Invitations when there is none. */
  onCopyInvite: () => void;
  hideButton?: React.ReactNode;
}) {
  const v = useVocab();
  const toast = useToast();
  const { currentUser, setPendingJoinRequestCountLocal } = useChapter();
  const orgSlug = currentUser?.org?.slug;
  const pending = currentUser?.org?.pendingJoinRequestCount ?? 0;
  const [band, setBand] = React.useState<Band | null>(null);

  // ── Join queue ──────────────────────────────────────────────────────────
  // Fetched only when the sidebar badge (from /api/auth/me) says someone is
  // waiting and the viewer may act on it — the route is MANAGE_BROTHERS-gated.
  const [requests, setRequests] = React.useState<JoinRequestRow[]>([]);
  const [requestTotal, setRequestTotal] = React.useState(0);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const loadRequests = React.useCallback(async () => {
    try {
      const data = await requestJson<{ rows: JoinRequestRow[]; total: number; pendingTotal: number }>(
        `/api/join-requests?page=1&take=${MAX_REQUESTS}`,
      );
      setRequests(data.rows);
      setRequestTotal(data.total);
      if (orgSlug) setPendingJoinRequestCountLocal(data.pendingTotal, orgSlug);
    } catch { /* non-fatal: the card falls back to Standing and the sidebar badge still points at the queue */ }
  }, [orgSlug, setPendingJoinRequestCountLocal]);
  React.useEffect(() => {
    if (!canReview || pending === 0) { setRequests([]); setRequestTotal(0); return; }
    void loadRequests();
  }, [canReview, pending, loadRequests]);

  async function approve(row: JoinRequestRow) {
    if (busyId != null) return;
    setBusyId(row.id);
    try {
      await requestJson(`/api/join-requests/${row.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: null }),
      });
      toast.success(`${row.name} is now on the roster.`);
      setRequests(rs => rs.filter(r => r.id !== row.id));
      setRequestTotal(n => Math.max(0, n - 1));
      onApproved();
      void loadRequests();
    } catch (e) {
      const wall = seatWallFrom(e);
      if (wall) {
        toast.error(wall.message, { action: { label: "Open roster", onClick: () => onOpenAll("#join-requests") } });
      } else if (e instanceof ApiError && e.status === 409 && apiErrorCode(e) === "JOIN_REQUEST_DECIDED") {
        toast.info("Already reviewed by another officer.");
        void loadRequests();
      } else {
        toast.error(apiErrorMessage(e, `Couldn't approve ${row.name}. Try again.`));
      }
    } finally {
      setBusyId(null);
    }
  }

  // ── Roster derivations ──────────────────────────────────────────────────
  const standing = measured ?? tracked;
  const statusKnown = ALL_TRACKED_KEYS.some(k => standing[k]);
  const serviceWord = v("Service");
  const now = React.useMemo(() => new Date(), []);

  const people = React.useMemo(() => brothers.map(b => {
    const k = statusKnown ? BAND_OF[getBrotherStatus(b, thresholds, standing)] : "good";
    return { b, band: k, why: b.id === selfId ? "you" : statusKnown ? reasonFor(b, k, thresholds, standing, serviceWord) : "" };
  }), [brothers, statusKnown, thresholds, standing, selfId, serviceWord]);

  const counts = React.useMemo(() => {
    const c: Record<Band, number> = { good: 0, watch: 0, risk: 0 };
    for (const p of people) c[p.band]++;
    return c;
  }, [people]);

  // Worst first, so the ones to look at lead; lowest attendance first within a band.
  const ranked = React.useMemo(() => [...people].sort((a, z) =>
    RANK[a.band] - RANK[z.band] || a.b.attendance - z.b.attendance || a.b.name.localeCompare(z.b.name),
  ), [people]);

  const newest = React.useMemo(() => [...brothers]
    .filter(b => b.joinedAt)
    .sort((a, z) => z.joinedAt!.localeCompare(a.joinedAt!))
    .slice(0, 4), [brothers]);
  const joinedThisMonth = brothers.filter(b => sameMonth(b.joinedAt, now)).length;

  const total = brothers.length;
  const dayOne = !loading && !error && total <= 1;
  const showQueue = canReview && requests.length > 0;
  const many = v("Member", true);
  const manyLower = many.toLowerCase();

  const avatar = (b: Brother) => (
    <BrotherAvatar brother={b} selfId={selfId} selfAvatarUrl={selfAvatarUrl} avatarRevision={avatarRevision} size="sm" />
  );

  // ── Pieces ──────────────────────────────────────────────────────────────
  const summary = (
    <div className="mc-top">
      <span className="mc-big">{total}</span>
      <p>
        on the roster<br />
        {dayOne
          ? "a crew of one, for now"
          : joinedThisMonth > 0
            ? <><b>+{joinedThisMonth}</b> joined this month</>
            : newest[0]?.joinedAt
              ? <>newest joined {new Date(newest[0].joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>
              : null}
      </p>
    </div>
  );

  const queue = showQueue && (
    <div className="mc-req">
      <div className="mc-h">Asking to join <span className="mc-count">{requestTotal}</span></div>
      {requests.slice(0, MAX_REQUESTS).map(r => (
        <div key={r.id} className="mc-req-r">
          {r.avatarUrl
            ? <img className="mc-av" src={r.avatarUrl} alt="" />
            : <span className="mc-av" style={{ background: `var(--pp-${toneOf(r.name)})` }} aria-hidden>{initials(r.name)}</span>}
          <div className="mc-who">
            <b>{r.name}</b>
            <small>{r.inviteLabel ? <>via {r.inviteLabel}</> : "via an invite link"}</small>
          </div>
          <button type="button" className="btn sm mc-sky" disabled={busyId != null} onClick={() => void approve(r)}>
            <PaperIcon name="check" /> {busyId === r.id ? "Approving…" : "Approve"}
          </button>
        </div>
      ))}
      {requestTotal > MAX_REQUESTS && (
        <button type="button" className="mc-more-req" onClick={() => onOpenAll("#join-requests")}>
          + {requestTotal - MAX_REQUESTS} more
        </button>
      )}
      {newest.length > 0 && (
        <div className="mc-newest">
          <span className="mc-faces">
            {newest.map(b => (
              <button key={b.id} type="button" title={b.name} onClick={() => onOpenMember(b.id)}>{avatar(b)}</button>
            ))}
          </span>
          newest {manyLower}
        </div>
      )}
    </div>
  );

  const linkRow = (
    <div className="mc-foot">
      <PaperIcon name="check" />
      <span>No one waiting to join</span>
      {inviteLink && <code>{inviteLink.replace(/^https?:\/\//, "")}</code>}
      {canInvite && (
        <button type="button" className="btn sm ghost mc-sky" onClick={onCopyInvite}>
          <PaperIcon name={inviteLink ? "copy" : "link"} /> {inviteLink ? "Copy" : "Make a link"}
        </button>
      )}
    </div>
  );

  const shownPool = band ? ranked.filter(p => p.band === band) : ranked;
  const shown = shownPool.slice(0, MAX_FACES);
  const firstRisk = ranked.find(p => p.band === "risk");
  const rule = ruleLine(thresholds, standing, serviceWord, v("Dues"));

  const standingBlock = (
    <div className="mc-stand">
      {statusKnown ? (
        <>
          <div className="mc-h">Standing{rule && <span className="mc-sub">{rule} puts someone on watch</span>}</div>
          <div className="mc-seg" role="group" aria-label="Standing">
            {BANDS.filter(x => counts[x.k] > 0).map(x => (
              <button
                key={x.k}
                type="button"
                className={`mc-t-${x.tone}${band && band !== x.k ? " dim" : ""}`}
                style={{ flex: counts[x.k] }}
                title={`${x.label} · ${counts[x.k]}`}
                aria-label={`${x.label}: ${counts[x.k]}`}
                onClick={() => setBand(b => b === x.k ? null : x.k)}
              >
                {counts[x.k] > 2 ? counts[x.k] : ""}
              </button>
            ))}
          </div>
          <div className="mc-key">
            {BANDS.map(x => (
              <button
                key={x.k}
                type="button"
                className={`mc-t-${x.tone}${band === x.k ? " on" : ""}`}
                aria-pressed={band === x.k}
                onClick={() => setBand(b => b === x.k ? null : x.k)}
              >
                <i />{x.label}<b>{counts[x.k]}</b>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mc-h">Everyone<span className="mc-sub">standing shows up once you take attendance</span></div>
      )}

      <div className="mc-st-faces">
        {shown.map(({ b, band: k, why }) => {
          const label = why ? `${b.name} · ${why}` : b.name;
          return (
            <button
              key={b.id}
              type="button"
              className={`mc-ph-${statusKnown ? k : "none"}${b.id === selfId ? " you" : ""}`}
              title={label}
              aria-label={label}
              onClick={() => onOpenMember(b.id)}
            >
              {avatar(b)}
            </button>
          );
        })}
        {shownPool.length > MAX_FACES && (
          <button type="button" className="mc-st-more" onClick={() => onOpenAll()}>+{shownPool.length - MAX_FACES}</button>
        )}
      </div>

      {firstRisk && band !== "good" && band !== "watch" && (
        <div className="mc-look">
          <PaperIcon name="alert" />
          <span>
            <b>{firstRisk.b.name}</b> {firstRisk.why}
            {counts.risk > 1 && <> · and {counts.risk - 1} more at risk</>}
          </span>
          <button type="button" className="btn sm mc-peach" onClick={() => setBand(b => b === "risk" ? null : "risk")}>
            {band === "risk" ? "Showing" : "See them"}
          </button>
        </div>
      )}

      {linkRow}
    </div>
  );

  const shareText = inviteLink ? `Join us on Chaptos: ${inviteLink}` : "";
  const dayOneBlock = (
    <div className="mc-crew">
      <div className="mc-seat-row">
        {brothers[0] && <span className="mc-me">{avatar(brothers[0])}</span>}
        {Array.from({ length: DAY_ONE_SEATS }, (_, i) => (
          <button key={i} type="button" className="mc-seat" aria-label="Invite someone" disabled={!canInvite} onClick={onCopyInvite}>
            <PaperIcon name="plus" />
          </button>
        ))}
      </div>
      <p className="mc-seat-cap">That&rsquo;s you. Everyone else&rsquo;s face shows up here as they join.</p>
      <div className="mc-tape">
        <p className="k">Bring your people in</p>
        <b>One link for everyone</b>
        {canInvite ? (
          <>
            <div className="mc-linkchip">
              <code>{inviteLink ? inviteLink.replace(/^https?:\/\//, "") : "No invite link yet"}</code>
              <button type="button" className="btn sm" onClick={onCopyInvite}>
                <PaperIcon name={inviteLink ? "copy" : "link"} /> {inviteLink ? "Copy" : "Create one"}
              </button>
            </div>
            {inviteLink && (
              <div className="mc-share">
                <a href={`sms:?&body=${encodeURIComponent(shareText)}`}><PaperIcon name="chat" /> Text it</a>
                <a href={`mailto:?subject=${encodeURIComponent(`Join ${currentUser?.org?.name ?? "us"} on Chaptos`)}&body=${encodeURIComponent(shareText)}`}>
                  <PaperIcon name="envelope" /> Email it
                </a>
              </div>
            )}
          </>
        ) : (
          <p className="mc-ask">Ask an officer to share the invite link.</p>
        )}
        <p className="rv"><PaperIcon name="eye" /> Opening it asks to join. You say yes to each one.</p>
      </div>
    </div>
  );

  return (
    <section id="sec-brothers" className="card mc dash-group" aria-label={many}>
      {hideButton}
      <div className="card-h">
        <PaperTile icon="people" tone="sky" />
        <h2>{many}</h2>
        <button type="button" className="mc-lnk" onClick={() => onOpenAll()}>
          Roster <PaperIcon name="arrow-r" />
        </button>
      </div>
      <div className="mc-b">
        {error ? (
          <SectionError what="the roster" onRetry={onRetry} />
        ) : loading ? (
          <div aria-busy="true" aria-label="Loading the roster" className="mc-skel">
            <i className="skel" style={{ width: 120, height: 36 }} />
            <i className="skel" style={{ width: "100%", height: 28 }} />
            <i className="skel" style={{ width: "70%", height: 30 }} />
          </div>
        ) : (
          <>
            {summary}
            {showQueue ? queue : dayOne ? dayOneBlock : standingBlock}
          </>
        )}
      </div>
    </section>
  );
}
