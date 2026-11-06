import React, { useEffect } from "react";
import type { LiveCheckIn as LiveCheckInData } from "@/lib/services/attendance-service";

// No "use client" directive: ledger/* components inherit client-ness from
// app/org/[slug]/page.tsx, which is itself "use client".
//
// Ending a live window asks one question — did the event happen? — and shows
// the roster as each answer would file it before the officer commits
// (_design/Check-In Cancel Mock.html). Inside the band on a wide screen
// (EndFork); a bottom sheet on a phone (EndSheet), where the band is too narrow
// to hold two answers side by side.

/** Under this share of the roster checked in, the cancel answer is outlined as
 *  the likely one. A hint only: nothing is preselected. */
const LIKELY_WRONG_SHARE = 0.1;

/** How long the officer has to undo a cancel. The server allows it for as long
 *  as the cancelled window lingers; this is the affordance, not the rule. */
export const CANCEL_UNDO_MS = 10_000;

const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="m9.5 14.5 2 2 3.5-4" />
  </svg>
);
export const VoidIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One dot per eligible member, as the answer would file them. */
function RosterDots({ present, eligible, kind }: { present: number; eligible: number; kind: "record" | "cancel" }) {
  return (
    <div className="lce-dots" aria-hidden="true">
      {Array.from({ length: eligible }, (_, i) => (
        <i key={i} className={i < present ? (kind === "record" ? "p" : "gone") : (kind === "record" ? "a" : "n")} />
      ))}
    </div>
  );
}

function Slips({ data, busy, onRecord, onCancel }: {
  data: LiveCheckInData;
  busy: null | "record" | "cancel";
  onRecord: () => void;
  onCancel: () => void;
}) {
  const present = data.presentCount;
  const eligible = data.eligibleCount;
  const absent = Math.max(0, eligible - present);
  const likelyWrong = eligible > 0 && present / eligible < LIKELY_WRONG_SHARE;

  return (
    <div className="lce-slips">
      <div className="lce-slip record">
        <div className="top">
          <span className="ic"><FileIcon /></span>
          <div>
            <h4>Yes — close &amp; record</h4>
            <p className="when">The meeting happened. File the roll.</p>
          </div>
          {likelyWrong && absent > 0 && <span className="tag warn">{plural(absent, "absence")}</span>}
        </div>
        <div className="sheet"><RosterDots present={present} eligible={eligible} kind="record" /></div>
        <p className="legend">
          <span><i className="p" /><b>{present}</b> present</span>
          <span><i className="a" /><b>{absent}</b> marked absent</span>
        </p>
        <p className="fx">Counts toward <b>everyone&rsquo;s attendance</b> this semester.</p>
        <button type="button" className="go" disabled={busy !== null} onClick={onRecord}>
          <CheckIcon />{busy === "record" ? "Recording…" : "Close & record"}
        </button>
      </div>

      <div className={`lce-slip cancel${likelyWrong ? " suggest" : ""}`}>
        <div className="top">
          <span className="ic"><VoidIcon /></span>
          <div>
            <h4>No — cancel, don&rsquo;t record</h4>
            <p className="when">Wrong event, a test, or it got called off.</p>
          </div>
          {likelyWrong && <span className="tag">Only {present} of {eligible} here</span>}
        </div>
        <div className="sheet">
          <RosterDots present={present} eligible={eligible} kind="cancel" />
          <span className="vs" aria-hidden="true"><span>NOT FILED</span></span>
        </div>
        <p className="legend">
          <span><i className="n" /><b>0</b> absences</span>
          <span><i className="gone" /><b>{present}</b> {present === 1 ? "check-in" : "check-ins"} thrown out</span>
        </p>
        <p className="fx"><b>Nobody&rsquo;s attendance changes.</b> You can undo for {CANCEL_UNDO_MS / 1000} seconds.</p>
        <button type="button" className="go" disabled={busy !== null} onClick={onCancel}>
          <VoidIcon />{busy === "cancel" ? "Cancelling…" : "Cancel check-in"}
        </button>
      </div>
    </div>
  );
}

type EndProps = {
  data: LiveCheckInData;
  busy: null | "record" | "cancel";
  onRecord: () => void;
  onCancel: () => void;
  onKeep: () => void;
};

/** Escape backs out, as "Keep it open" does. */
function useEscape(onKeep: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onKeep(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKeep]);
}

/** Wide screens: slides out of the band's own bottom edge. */
export function EndFork({ data, busy, onRecord, onCancel, onKeep }: EndProps) {
  useEscape(onKeep);
  return (
    <div className="lce-fork" role="group" aria-label="End check-in">
      <div className="lce-fork-h">
        <h3>Did {data.event.title} happen?</h3>
        <p>Check-ins keep coming in until you pick.</p>
        <button type="button" className="live-alt lce-keep" onClick={onKeep}>Keep it open</button>
      </div>
      <Slips data={data} busy={busy} onRecord={onRecord} onCancel={onCancel} />
    </div>
  );
}

/** Phones: a bottom sheet over the dashboard. */
export function EndSheet({ data, busy, onRecord, onCancel, onKeep }: EndProps) {
  useEscape(onKeep);
  const d = new Date(`${data.event.date}T00:00:00Z`);
  return (
    <div className="lce-scrim" onClick={e => { if (e.target === e.currentTarget) onKeep(); }}>
      <div className="lce-psheet" role="dialog" aria-modal="true" aria-label="End check-in">
        <div className="grab" aria-hidden="true" />
        <div className="lce-ev">
          <span className="d">
            <small>{d.toLocaleDateString([], { weekday: "short", timeZone: "UTC" }).toUpperCase()}</small>
            <b>{d.getUTCDate()}</b>
          </span>
          <div className="mid">
            <p className="t">{data.event.title}</p>
            {data.event.location && <p className="m">{data.event.location}</p>}
          </div>
          <span className="n"><span className="lce-live-dot" />{data.presentCount}/{data.eligibleCount}</span>
        </div>
        <h3>Did it happen?</h3>
        <p className="sub">Check-ins keep coming in until you pick.</p>
        <Slips data={data} busy={busy} onRecord={onRecord} onCancel={onCancel} />
        <button type="button" className="lce-keep2" onClick={onKeep}>Keep it open</button>
      </div>
    </div>
  );
}

/** The undo countdown: a ring that empties over CANCEL_UNDO_MS. */
export function UndoRing({ left }: { left: number }) {
  const C = 50.3;
  return (
    <svg className="lce-ring" viewBox="0 0 20 20" aria-hidden="true">
      <circle className="bg" cx="10" cy="10" r="8" />
      <circle className="fg" cx="10" cy="10" r="8" strokeDasharray={C} strokeDashoffset={(C * (1 - left / CANCEL_UNDO_MS)).toFixed(1)} />
    </svg>
  );
}

/** Phones: undo rides above the tab bar instead of inside the band. */
export function UndoSnack({ discarded, left, busy, onUndo }: { discarded: number; left: number; busy: boolean; onUndo: () => void }) {
  return (
    <div className="lce-snack" role="status">
      <UndoRing left={left} />
      <p>Check-in cancelled<small>{plural(discarded, "check-in")} thrown out · no absences</small></p>
      <button type="button" disabled={busy} onClick={onUndo}>{busy ? "Undoing…" : "Undo"}</button>
    </div>
  );
}
