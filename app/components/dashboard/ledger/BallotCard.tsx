import React, { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate, type Poll } from "../../../data";
import { apiErrorMessage } from "../../../lib/api";

/** Whole calendar days between two ISO dates (to - from). */
function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Sentence-case "closes …" fragment for the ballot's sub line. */
function closesLabel(closeDate: string | null, today: string): string {
  if (!closeDate) return "No close date";
  const n = daysBetween(today, closeDate);
  if (n < 0) return "Past its close date";
  if (n === 0) return "Closes today";
  if (n === 1) return "Closes tomorrow";
  if (n <= 14) return `Closes in ${n} days`;
  return `Closes ${fmtDate(closeDate)}`;
}

/** How long the tally stays up after you vote before the card retires itself. */
const HOLD_MS = 6000;
/** Must match the .ballot / .bl-body transition durations in dashboard-ledger.css. */
const COLLAPSE_MS = 460;
const SWAP_MS = 220;

type Phase = "ballot" | "results";

/**
 * "Your vote" — the ballot that only exists when there is one.
 *
 * Sits above This Week in the rail and renders **nothing** unless an open poll
 * is assigned to the viewer and still awaits their vote (the parent fetches
 * `?assignee=me&status=open` and the head is the first poll with no vote of
 * theirs). Casting happens inline: pick, cast, watch the tally phase in, and the
 * card retires itself ~6s later — voting is a one-shot errand, so a permanent
 * dashboard slot for it would be a permanent slot for stale news.
 *
 * The hold runs on a plain timer with a depleting hairline to telegraph it, and
 * deliberately does NOT pause on hover: clicking "Cast" leaves the pointer
 * parked on the card, so a hover-pause would hold the results on screen
 * indefinitely for every mouse user — the exact opposite of retiring itself.
 * Anyone who wants the tally back has it on /tasks, which is also where vote
 * changes and closed polls live; this card deliberately does one thing.
 *
 * When another poll is still pending the body swaps to it instead of
 * collapsing; the card only folds away when the queue is empty.
 */
export function BallotCard({
  polls,
  today,
  onVote,
  onDismiss,
}: {
  /** Open polls assigned to the viewer. Any already carrying their vote are skipped. */
  polls: Poll[];
  /** ISO today, from the page's rolling clock. */
  today: string;
  /** Casts the vote and resolves with the unsealed poll (tallies + your pick). */
  onVote: (pollId: number, optionId: number) => Promise<Poll>;
  /** Drops the poll from the parent's queue once the card is done with it. */
  onDismiss: (pollId: number) => void;
}) {
  const pending = polls.filter(p => p.status === "open" && p.myVoteOptionId == null);
  const head = pending[0] ?? null;

  const [phase, setPhase] = useState<Phase>("ballot");
  const [pick, setPick] = useState<number | null>(null);
  const [casting, setCasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The server's reply to our vote — results render from this, not from props. */
  const [result, setResult] = useState<Poll | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Frozen pixel height for the collapse; null until we start leaving. */
  const [collapseFrom, setCollapseFrom] = useState<number | null>(null);

  const cardRef = useRef<HTMLElement | null>(null);

  // Bars grow 0 → width on entering results: paint them empty for one frame,
  // then let the CSS width transition carry them out.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (phase !== "results") { setGrown(false); return; }
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setGrown(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [phase]);

  // A new head means a new ballot — clear the previous pick so a stale option id
  // can never be cast against a different poll.
  const headId = head?.id ?? null;
  useEffect(() => { setPick(null); setError(null); }, [headId]);

  const shown = phase === "results" ? result : head;

  const finish = useCallback((pollId: number, hasNext: boolean) => {
    if (hasNext) {
      // Another poll is waiting — swap the body rather than folding the card.
      setSwapping(true);
      window.setTimeout(() => {
        onDismiss(pollId);
        setResult(null);
        setPhase("ballot");
        setSwapping(false);
      }, SWAP_MS);
      return;
    }
    // Last one: freeze the current height, then collapse to nothing so This Week
    // slides up instead of jumping.
    setCollapseFrom(cardRef.current?.offsetHeight ?? null);
    requestAnimationFrame(() => requestAnimationFrame(() => setLeaving(true)));
    window.setTimeout(() => {
      onDismiss(pollId);
      setResult(null);
      setPhase("ballot");
      setLeaving(false);
      setCollapseFrom(null);
    }, COLLAPSE_MS);
  }, [onDismiss]);

  // The retire timer: one hold, started when the tally appears.
  useEffect(() => {
    if (phase !== "results" || !result || swapping || leaving) return;
    const hasNext = pending.some(p => p.id !== result.id);
    const t = window.setTimeout(() => finish(result.id, hasNext), HOLD_MS);
    return () => window.clearTimeout(t);
    // `pending` is only read when the timer fires; listing it would restart the
    // hold on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result, swapping, leaving, finish]);

  async function cast() {
    if (!head || pick == null || casting) return;
    setCasting(true);
    setError(null);
    try {
      const saved = await onVote(head.id, pick);
      setResult(saved);
      setPhase("results");
    } catch (e) {
      // Prefer the server's own sentence ("This poll is closed", "You can only
      // vote on polls assigned to you") — a poll can be closed or reassigned
      // between the dashboard loading and the vote landing, and "try again"
      // would be a lie in both cases. The fallback covers the answerless
      // failures: a dropped connection or requestJson's 15s timeout. Retrying
      // after one of those is safe — the vote is an upsert keyed on
      // (pollId, brotherId), so a request that landed unheard is overwritten,
      // never doubled.
      setError(apiErrorMessage(e, "Couldn't record your vote. Try again."));
    } finally {
      setCasting(false);
    }
  }

  // Nothing assigned, nothing pending, nothing mid-retirement — render nothing.
  if (!shown) return null;

  const total = shown.totalVotes;
  const queued = pending.length;

  return (
    <section
      ref={cardRef}
      id="sec-ballot"
      className={`card ballot${leaving ? " leaving" : ""}`}
      style={collapseFrom != null ? { maxHeight: leaving ? 0 : collapseFrom } : undefined}
      aria-label="Poll awaiting your vote"
    >
      <div className="card-h">
        <h2>Your vote</h2>
        <div className="right">
          <span className="sub">
            {phase === "results" ? "Vote recorded" : queued > 1 ? `1 of ${queued}` : "Open poll"}
          </span>
        </div>
      </div>

      <div className={`bl-body${swapping ? " swapping" : ""}`}>
        <p className="bl-q">{shown.question}</p>

        {phase === "ballot" ? (
          <>
            <p className="bl-sub">{closesLabel(shown.closeDate, today)}</p>
            <div className="bl-options">
              {shown.options.map(o => (
                <button
                  key={o.id}
                  type="button"
                  className={`bl-line${pick === o.id ? " picked" : ""}`}
                  aria-pressed={pick === o.id}
                  onClick={() => setPick(o.id)}
                >
                  <span className="bl-radio"><span className="bl-radio-dot" /></span>
                  <span className="bl-label">{o.label}</span>
                </button>
              ))}
            </div>
            {error && <p className="bl-error" role="alert">{error}</p>}
            <button
              type="button"
              className={`bl-cast${pick != null && !casting ? " ready" : ""}`}
              disabled={pick == null || casting}
              onClick={cast}
            >
              {casting ? "Casting…" : "Cast your vote"}
            </button>
          </>
        ) : (
          <div aria-live="polite">
            <p className="bl-sub live">
              <span className="bl-live-dot" />
              {total} of {shown.assigneeCount} voted
            </p>
            <div className="bl-results">
              {shown.options.map(o => {
                const count = o.voteCount ?? 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                const mine = shown.myVoteOptionId === o.id;
                return (
                  <div key={o.id} className={`bl-result${mine ? " mine" : ""}`}>
                    <span className="bl-result-head">
                      <span className="bl-label">
                        {o.label}
                        {mine && <span className="bl-you">Your vote</span>}
                      </span>
                      <span className="bl-pct">{pct}%</span>
                    </span>
                    <span className="bl-bar"><span style={{ width: grown ? `${pct}%` : "0%" }} /></span>
                  </div>
                );
              })}
            </div>
            {/* Explains the disappearance before it happens. */}
            <span className="bl-countdown" aria-hidden><span style={{ animationDuration: `${HOLD_MS}ms` }} /></span>
          </div>
        )}
      </div>
    </section>
  );
}
