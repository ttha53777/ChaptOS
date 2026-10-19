"use client";
// Ending a term. Start the next one and the dashboard opens on day one, while
// the term you just finished is filed whole: still there to open, still there
// to ask about.
import { useEffect, useRef, useState } from "react";
import { Spark, WindowBar } from "./chrome";

type Term = { id: string; name: string; dates: string; stats: { k: string; v: string; s: string }[] };
const FALL: Term = {
  id: "fa26", name: "Fall 2026", dates: "Aug 24 – Dec 11",
  stats: [
    { k: "Dues collected", v: "$14,200", s: "50 of 52 paid" },
    { k: "Meetings", v: "14", s: "minutes for every one" },
    { k: "Events", v: "31", s: "6 required" },
    { k: "Attendance", v: "87%", s: "at required events" },
  ],
};
const SPRING: Term = {
  id: "sp27", name: "Spring 2027", dates: "Jan 11 – May 7",
  stats: [
    { k: "Dues collected", v: "Not charged yet", s: "set spring dues" },
    { k: "Meetings", v: "None yet", s: "first one Jan 17" },
    { k: "Events", v: "4 planned", s: "on the timeline" },
    { k: "Attendance", v: "No roll yet", s: "starts at the first meeting" },
  ],
};
const OLDER = [{ id: "sp26", name: "Spring 2026", dates: "Jan 12 – May 8" }];

type QA = { q: string; a: string; rows: { t: string; v: string }[]; cite: string };
const ASK: QA[] = [
  {
    q: "What did we spend on formal?",
    a: "**$4,180** across three payments, all in Fall 2026.",
    rows: [{ t: "Grand Hall · venue", v: "$3,200" }, { t: "DJ", v: "$650" }, { t: "Photo booth", v: "$330" }],
    cite: "Treasury · Fall 2026",
  },
  {
    q: "Who still owed dues when fall ended?",
    a: "**Two members** had a balance when the term closed.",
    rows: [{ t: "Tyler Brooks", v: "$120" }, { t: "Eli Turner", v: "$60" }],
    cite: "Dues · Fall 2026",
  },
  {
    q: "Where's the venue contract?",
    a: "In **Docs › Events**. Docs aren't filed by term, so it's where it always was.",
    rows: [{ t: "Grand Hall contract", v: "Link" }],
    cite: "Docs · Events",
  },
];

const Bold = ({ text }: { text: string }) =>
  <>{text.split(/(\*\*[^*]+\*\*)/).map((t, i) => t.startsWith("**") ? <mark key={i}>{t.slice(2, -2)}</mark> : t)}</>;

export function TermDemo() {
  const [flipped, setFlipped] = useState(false);
  const [filing, setFiling] = useState(false);
  const [viewing, setViewing] = useState<"active" | "fa26">("active");
  const [asked, setAsked] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  function start() {
    if (flipped || filing) return;
    setFiling(true);
    later(700, () => { setFlipped(true); setFiling(false); });
  }
  function reset() {
    timers.current.forEach(clearTimeout); timers.current = [];
    setFlipped(false); setFiling(false); setViewing("active"); setAsked(null); setThinking(false);
  }
  function ask(i: number) {
    timers.current.forEach(clearTimeout); timers.current = [];
    setAsked(i); setThinking(true);
    later(900, () => setThinking(false));
  }

  const active = flipped ? SPRING : FALL;
  const shown = viewing === "fa26" ? FALL : active;
  const past = flipped ? [{ id: FALL.id, name: FALL.name, dates: FALL.dates }, ...OLDER] : OLDER;
  const qa = asked !== null ? ASK[asked] : null;

  return <div className="bld bld-win ho-term">
    <WindowBar path="settings › semesters" />
    <div className="ho-term-grid">
      <div className="ho-terms">
        <p className="kick">Semesters</p>
        <div className={`ho-tm now${filing ? " leaving" : ""}`} key={active.id}>
          <span className="dot" />
          <span className="nm"><b>{active.name}</b><small>{active.dates}</small></span>
          <span className="badge">Active</span>
        </div>
        {!flipped && (
          <div className="ho-next">
            <span className="nm"><b>{SPRING.name}</b><small>{SPRING.dates}</small></span>
            <button type="button" className="tld-btn sm" style={{ ["--ac" as string]: "var(--butter)" }} onClick={start} disabled={filing}>
              {filing ? "Filing fall…" : "Make it active"}
            </button>
          </div>
        )}
        <p className="kick sub">Filed</p>
        <ul className="ho-filed">
          {past.map(t => (
            <li key={t.id} className={t.id === FALL.id ? "fresh" : ""}>
              <button type="button" className={viewing === t.id ? "on" : ""} disabled={t.id !== FALL.id}
                onClick={() => setViewing(v => v === "fa26" ? "active" : "fa26")}>
                <span className="tab">{t.name}</span>
                <small>{t.dates}{t.id === FALL.id ? " · tap to open" : ""}</small>
              </button>
            </li>
          ))}
        </ul>
        {flipped
          ? <button type="button" className="tld-btn ghost sm" onClick={reset}>Go back to fall</button>
          : <p className="hint">Nothing is deleted. The old term just stops being the default view.</p>}
      </div>

      <div className="ho-dash-col">
        <div className={`ho-dash${filing ? " filing" : ""}${viewing === "fa26" ? " old" : ""}`} key={shown.id + viewing}>
          <div className="hd">
            <span className="kick">Dashboard</span>
            <b>{shown.name}</b>
            {viewing === "fa26"
              ? <button type="button" className="back" onClick={() => setViewing("active")}>Back to {active.name}</button>
              : flipped && <span className="day1">Day one</span>}
          </div>
          <div className="stats">
            {shown.stats.map(s => (
              <div key={s.k} className={`st${/^(Not|None|No )/.test(s.v) ? " quiet" : ""}`}>
                <small>{s.k}</small><b>{s.v}</b><span>{s.s}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`ho-ask${flipped ? " on" : ""}`}>
          <div className="hd"><Spark /><b>Ask about last term</b>{!flipped && <small>start spring first</small>}</div>
          <div className="chips">
            {ASK.map((x, i) => (
              <button key={x.q} type="button" className={asked === i ? "on" : ""} onClick={() => ask(i)} disabled={!flipped}>{x.q}</button>
            ))}
          </div>
          {qa && flipped && (
            <div className="ans" key={asked}>
              {thinking
                ? <p className="think"><i /><i /><i />Reading {qa.cite.split(" · ")[0]}…</p>
                : <>
                    <p className="v"><Bold text={qa.a} /></p>
                    <ul>{qa.rows.map(r => <li key={r.t}><span>{r.t}</span><b>{r.v}</b></li>)}</ul>
                    <p className="cite">From {qa.cite}</p>
                  </>}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>;
}
