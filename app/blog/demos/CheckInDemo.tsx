"use client";
// Live check-in, drawn as the dashboard's Paper band (ledger/LiveCheckIn.tsx,
// paper-checkin.css): open it, tap "I'm here", watch the room fill, close it to
// record the roll. The window is an hour and turns gold for its last five
// minutes (lib/checkin.ts); here a second is a minute.
import { useEffect, useMemo, useRef, useState } from "react";
import { ROLL } from "./roster";
import { WindowBar } from "./chrome";

const WINDOW = 60, CLOSING = 5;
const YOU = "Noah";
/** Approved excuses before the meeting: they aren't expected. */
const EXCUSED = ["Kofi", "Omar", "Devin"];
const OTHERS = ROLL.filter(n => n !== YOU && !EXCUSED.includes(n));
/** When each member checks in (minutes after opening): a rush, then stragglers. Seven never do. */
const scatter = (n: string) => [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
const ARRIVAL = new Map([...OTHERS].sort((a, b) => scatter(a) - scatter(b)).slice(0, OTHERS.length - 7).map((name, i, all) => {
  const rush = Math.round(all.length * .7);
  return [name, i < rush ? .4 + (i / rush) * 4 : 4.5 + ((i - rush) / (all.length - rush)) ** 1.5 * 16];
}));
const SEATS = [...ROLL].sort((a, b) => (a === YOU ? -1 : b === YOU ? 1 : 0));
const ELIGIBLE = ROLL.length - EXCUSED.length;
const TONES = ["var(--mint)", "var(--sky)", "var(--butter)", "var(--lilac)", "var(--peach)", "var(--rose)"];
const tone = (name: string) => TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
const clockAt = (min: number) => `8:${String(Math.floor(min)).padStart(2, "0")} PM`;
const initials = (n: string) => n.slice(0, 2);

type Phase = "ready" | "open" | "closed";

export function CheckInDemo() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [min, setMin] = useState(0);
  const [youAt, setYouAt] = useState<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== "open") return;
    tick.current = setInterval(() => setMin(m => Math.min(WINDOW, m + .25)), 250);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [phase]);
  // An hour after opening, the window closes itself.
  useEffect(() => { if (phase === "open" && min >= WINDOW) setPhase("closed"); }, [phase, min]);

  const live = phase !== "ready";
  const arrived = useMemo(() => [...ARRIVAL].filter(([, at]) => live && at <= min).sort((a, b) => b[1] - a[1]), [min, live]);
  const youIn = youAt !== null;
  const present = arrived.length + (youIn ? 1 : 0);
  const latest = [...(youIn ? [["You", youAt] as [string, number]] : []), ...arrived].sort((a, b) => b[1] - a[1]);
  const closing = phase === "open" && WINDOW - min <= CLOSING;
  const state = phase === "ready" ? "s-ready" : phase === "closed" ? "s-closed" : closing ? "s-closing" : youIn ? "s-done" : "s-open";

  function open() { setPhase("open"); setMin(0); setYouAt(null); }
  function reset() { setPhase("ready"); setMin(0); setYouAt(null); }

  const kicker = phase === "ready" ? "Starts now"
    : phase === "closed" ? "Check-in closed"
    : youIn ? "You're checked in"
    : closing ? "Check-in closing"
    : "Happening now";
  const elapsed = phase === "ready" ? "8:00 PM"
    : phase === "closed" ? `ended ${clockAt(Math.min(min, 59))}`
    : min < 1 ? "opened just now" : `opened ${Math.floor(min)} min ago`;

  function seat(name: string) {
    if (name === YOU) return youIn ? "in" : phase === "closed" ? "absent" : "wait";
    if (EXCUSED.includes(name)) return "excused";
    const at = ARRIVAL.get(name);
    return at !== undefined && live && at <= min ? "in" : phase === "closed" ? "absent" : "wait";
  }

  return <div className="bld bld-win tld-ci tci">
    <WindowBar path="dashboard" />
    <div className="tci-stage">
      <section className={`tci-band ${state}`} aria-label="Live event check-in">
        <div className="rule" aria-hidden><i style={{ transform: `scaleY(${phase === "open" ? 1 - min / WINDOW : phase === "ready" ? 1 : 0})` }} /></div>
        <div className="body">
          <div className="what">
            <p className="kicker"><span className={`dot${phase === "open" && !youIn ? " beat" : ""}`} />{kicker}<span className="el">· {elapsed}</span></p>
            <h3 className="title">Chapter Meeting — Week 9</h3>
            {youIn && phase !== "ready" && <div className="receipt">
              <span className="chk"><Check /></span>
              <p><b>Present</b> — {clockAt(youAt!)}{phase === "open" && <> · <button type="button" onClick={() => setYouAt(null)}>undo</button></>}</p>
            </div>}
            {closing && <p className="nudge">Closing soon — <b>anyone who hasn&rsquo;t checked in will be marked absent</b> when it ends.</p>}
            <p className="meta">
              <span>8:00 PM</span><span className="sep">·</span><span><b>Chapter room</b></span><span className="sep">·</span>
              <span className="req">Mandatory</span>
              {phase === "open" && <button type="button" className="alt close" onClick={() => setPhase("closed")}>Close &amp; record attendance</button>}
              {phase === "open" && <button type="button" className="alt" onClick={() => setMin(m => Math.min(WINDOW - .25, m + 15))}>Skip 15 min</button>}
              {phase === "closed" && <button type="button" className="alt" onClick={reset}>Start over</button>}
            </p>
          </div>

          <div className="count">
            <p className="n">{present}<small>/{ELIGIBLE}</small></p>
            <p className="k">{phase === "closed" ? <>final tally · {ELIGIBLE - present} absent</> : "here now"}</p>
            <span className="track"><i style={{ width: `${(present / ELIGIBLE) * 100}%` }} /></span>
            <div className="stack">
              {latest.length === 0
                ? phase === "open" && <span>Waiting for the first check-in…</span>
                : <>
                  <span className="s">{latest.slice(0, 4).map(([n]) => <span key={n} className={`av${n === "You" ? " you" : ""}`}>{n === "You" ? "You" : initials(n)}</span>)}</span>
                  <span>{latest[0][0]} · {clockAt(latest[0][1])}</span>
                </>}
            </div>
          </div>

          <div className="act">
            {phase === "ready"
              ? <button type="button" className="btn nudge-ring" onClick={open}><Bolt />Open check-in</button>
              : phase === "open" && !youIn
                ? <button type="button" className="btn nudge-ring" onClick={() => setYouAt(min)}><Check />I&apos;m here</button>
                : <span className={`stamp${phase === "closed" ? " filed" : ""}`} key={phase}>{phase === "closed" ? "RECORDED" : "HERE"}<small>{phase === "closed" ? "Oct 26 · roll" : clockAt(youAt ?? 0)}</small></span>}
          </div>
        </div>
      </section>

      <div className="tci-room" aria-label="The room">
        <div className="hd">
          <span className="lab">The room</span>
          <span className="legend">
            <span><i className="in" />Here</span>
            <span><i className="excused" />Excused</span>
            <span><i className={phase === "closed" ? "absent" : "wait"} />{phase === "closed" ? "Absent" : "Not yet"}</span>
          </span>
        </div>
        <div className="seats">
          {SEATS.map(n => {
            const s = seat(n);
            return <span key={n} title={`${n === YOU ? "You" : n} · ${s === "in" ? "here" : s === "wait" ? "not yet" : s}`}
              className={`seat ${s}${n === YOU ? " you" : ""}`} style={{ ["--t" as string]: tone(n) }}>
              {n === YOU ? "You" : initials(n)}
            </span>;
          })}
        </div>
        <p className="hint">{phase === "ready"
          ? `${ROLL.length} members, ${EXCUSED.length} excused ahead of time. Open check-in when the meeting starts.`
          : phase === "open" ? "Everyone checks in from their own phone. A second here is a minute; the real window stays open an hour."
          : "Saved as the meeting's roll and counted toward everyone's attendance. Officers can still fix a mark."}</p>
      </div>
    </div>
  </div>;
}

const Check = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Bolt = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>;
