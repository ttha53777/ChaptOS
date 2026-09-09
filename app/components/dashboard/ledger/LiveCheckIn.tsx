import React, { useEffect, useState } from "react";
import { CHECKIN_WINDOW_MS } from "@/lib/checkin";
import type { LiveCheckIn as LiveCheckInData } from "@/lib/services/attendance-service";
import { apiErrorMessage } from "../../../lib/api";
import { WhosHere } from "./WhosHere";

// No "use client" directive: ledger/* components inherit client-ness from
// app/[slug]/page.tsx, which is itself "use client".

/** "12 min ago" / "just now" — the window opened, not the event's own start. */
function sinceLabel(iso: string, now: number): string {
  const mins = Math.floor((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}

/** Clock time from an ISO instant, in the viewer's own locale. */
function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export function LiveCheckIn({
  data,
  onCheckIn,
  onUndo,
  onClose,
  onReopen,
  onTakeAttendance,
  onFileExcuse,
}: {
  /** The live window, or null when there is none — the 99% case, where the band
   *  renders nothing at all rather than an empty state. */
  data: LiveCheckInData | null;
  /** Mark yourself present. The page owns the fetch; this only reports failure. */
  onCheckIn: () => Promise<void>;
  /** Undo your own check-in while the window is still open. */
  onUndo: () => Promise<void>;
  /** Officer actions are undefined for a member who lacks MANAGE_ATTENDANCE —
   *  not a boolean flag. A button rendered for everyone and 403'd on press is
   *  the failure mode this convention exists to prevent. */
  onClose?: () => Promise<void>;
  onReopen?: () => Promise<void>;
  onTakeAttendance?: () => void;
  /** Opens the excuse form. Undefined hides the link. */
  onFileExcuse?: () => void;
}) {
  // Which action is in flight — not merely that one is. A single boolean made an
  // officer's "reopen" relabel the member-facing button to "Checking in…".
  const [busy, setBusy] = useState<null | "checkin" | "undo" | "window">(null);
  const [error, setError] = useState<string | null>(null);
  // The "Who's here" sheet. Its roster is fetched on open, not carried by the
  // 20s poll that feeds this card — see getLiveRoster.
  const [rosterOpen, setRosterOpen] = useState(false);
  // Drives the "started N min ago" line and the draining rule between polls, so
  // the band ages smoothly instead of jumping every 20s when the poll lands.
  const [now, setNow] = useState(() => Date.now());

  const open = data?.state === "open" || data?.state === "closing";
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    // A backgrounded tab throttles that interval to >=60s (often far worse when
    // the machine sleeps), so on return the "opened N min ago" line and the
    // draining rule are both stale. The hook re-syncs the DATA on foreground;
    // this re-syncs the clock those two derive from.
    const onVisible = () => { if (!document.hidden) setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open]);

  if (!data) return null;

  const { event, state, me, presentCount, eligibleCount } = data;
  const excuseApproved = me.excuse?.status === "approved";
  const excusePending  = me.excuse?.status === "pending";
  const closed = state === "closed";

  // One class carries the card's whole temperature. Precedence matters: being
  // accounted for (checked in / excused) outranks the window's urgency, because
  // there is nothing left for this member to hurry about.
  const tone =
    excuseApproved      ? "excused"
    : me.checkedIn      ? "done"
    : closed            ? "done"
    : state === "closing" ? "closing"
    : "";

  // The remaining fraction of the window, as the draining accent edge.
  const elapsed = now - Date.parse(data.openedAt);
  const remaining = closed ? 0 : Math.max(0, Math.min(1, 1 - elapsed / CHECKIN_WINDOW_MS));

  const pct = eligibleCount > 0 ? Math.round((presentCount / eligibleCount) * 100) : 0;

  async function run(kind: "checkin" | "undo" | "window", action: () => Promise<void>, fallback: string) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      // A failed check-in is answered where the button is, not in the page-level
      // banner at the top of a page the member may have scrolled past.
      setError(apiErrorMessage(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  const kicker =
    closed          ? "Check-in closed"
    : excuseApproved ? "You're excused"
    : me.checkedIn  ? "You're checked in"
    : state === "closing" ? "Check-in closing"
    : "Happening now";

  return (
    <>
    <section className={`live${tone ? ` ${tone}` : ""}`} aria-label="Live event check-in">
      <div className="live-rule">
        <i style={{ transform: `scaleY(${remaining.toFixed(3)})` }} />
      </div>

      {/* The only thing worth interrupting a screen reader for: this member's own
          status. It changes when THEY act, not every 20 seconds. */}
      <p className="live-said" role="status" aria-live="polite">
        {excuseApproved ? `You are excused from ${event.title}.`
          : me.checkedIn ? `You are checked in to ${event.title}.`
          : ""}
      </p>

      <div className="live-body">
        <div className="live-what">
          <p className="live-kicker">
            <span className="live-dot" />
            <span>{kicker}</span>
            <span className="live-sep">·</span>
            <span className="live-elapsed">
              {closed
                ? data.closedAt
                  ? `ended ${clockLabel(data.closedAt)}${data.closedByName ? ` by ${data.closedByName}` : ""}`
                  : "ended"
                : `opened ${sinceLabel(data.openedAt, now)}`}
            </span>
          </p>

          <h2 className="live-title">{event.title}</h2>

          {/* The receipt sits UNDER the title, which stays put — the card must
              not change identity at the moment you most need to be sure it's
              the same event. */}
          {me.checkedIn && !closed && (
            <div className="live-receipt">
              <span className="live-check"><CheckIcon /></span>
              <p className="r-t">
                <b>Present</b>
                {me.checkedInAt ? ` — ${clockLabel(me.checkedInAt)}` : ""}
                {" · "}
                <button type="button" className="live-undo" disabled={busy !== null} onClick={() => run("undo", onUndo, "Could not undo your check-in.")}>
                  {busy === "undo" ? "undoing…" : "undo"}
                </button>
              </p>
            </div>
          )}

          {excuseApproved && (
            <div className="live-receipt">
              <span className="live-check"><CheckIcon /></span>
              <p className="r-t"><b>Excused</b> — an officer approved your excuse. Nothing to do.</p>
            </div>
          )}

          {/* Pending is NOT a receipt: nothing is decided, "I'm here" stays put,
              and the note is muted grey — the app's colour for "no state yet". */}
          {excusePending && !me.checkedIn && (
            <div className="live-receipt">
              <span className="live-check pending" aria-hidden="true">?</span>
              <p className="r-t r-pending">
                <b>Excuse pending review</b> — you're still marked absent until an officer decides.
              </p>
            </div>
          )}

          {/* The officer nudge. An expired-but-unclosed window records NOTHING —
              lib/attendance.ts counts only the AttendanceRecord rows that exist,
              so the no-shows never become absences and every ratio in the
              chapter reads 100%. Closing is the write that makes the numbers
              true, and nothing else prompts for it, so the last stretch of the
              window says so out loud to whoever can act. */}
          {onClose && !closed && state === "closing" && (
            <p className="live-nudge">
              Closing soon — <b>close it to record attendance</b>. If it just expires, nobody is marked absent.
            </p>
          )}

          {/* An expired window that was never closed. It reads as "closed" but
              no absences were ever written; reopening is what gets the officer
              back to a window they can close for real. */}
          {closed && onReopen && !data.closedAt && (
            <p className="live-nudge">
              This window expired without being closed, so <b>no attendance was recorded</b>. Reopen it to close it properly.
            </p>
          )}

          <p className="live-meta">
            {event.time && <><span>{event.time}</span><span className="dotsep">·</span></>}
            {event.location && <><span><b>{event.location}</b></span><span className="dotsep">·</span></>}
            {event.mandatory && <span className="live-req">Mandatory</span>}

            {onTakeAttendance && (
              <button type="button" className="live-alt" onClick={onTakeAttendance}>
                Take attendance
              </button>
            )}
            {!closed && onClose && (
              <button type="button" className="live-alt live-close" disabled={busy !== null} onClick={() => run("window", onClose, "Could not close check-in.")}>
                {busy === "window" ? "Closing…" : "Close & record attendance"}
              </button>
            )}
            {closed && onReopen && (
              <button type="button" className="live-alt live-close" disabled={busy !== null} onClick={() => run("window", onReopen, "Could not reopen check-in.")}>
                {busy === "window" ? "Reopening…" : "Reopen check-in"}
              </button>
            )}
            {!closed && !me.checkedIn && !me.excuse && onFileExcuse && (
              <button type="button" className="live-alt" onClick={onFileExcuse}>
                File an excuse
              </button>
            )}
          </p>

          {error && <p className="live-err" role="alert">{error}</p>}
        </div>

        <div className="live-gap" />

        {/* No aria-live here. It used to sit on this block, so every 20s poll
            re-announced the tally to a screen reader — a number that changes on
            its own, read aloud over whatever the member was doing. The member's
            OWN state change is announced instead, from .live-said below. */}
        <div className="live-count">
          <p className="n">{presentCount}<small>/{eligibleCount}</small></p>
          <p className="k">{closed ? "final tally" : "here now"}</p>
          <span className="track"><i style={{ width: `${pct}%` }} /></span>
        </div>

        {/* The primary slot is never empty. Before you check in it asks you to;
            after, it turns into the way to see the room you just joined — the
            card keeps one action at every stage rather than going inert the
            moment a member has done their part. */}
        <div className="live-act">
          {!closed && !me.checkedIn && !excuseApproved ? (
            <button type="button" className="live-btn" disabled={busy !== null} onClick={() => run("checkin", onCheckIn, "Could not check you in.")}>
              <CheckIcon />
              {busy === "checkin" ? "Checking in…" : "I'm here"}
            </button>
          ) : (
            <button type="button" className="live-btn" onClick={() => setRosterOpen(true)}>
              See who&rsquo;s here
            </button>
          )}
        </div>
      </div>
    </section>

    {rosterOpen && <WhosHere live={data} onClose={() => setRosterOpen(false)} />}
    </>
  );
}
