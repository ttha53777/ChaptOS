"use client";
// The opener: one semester's dates as they really live — a group chat, a
// spreadsheet, a doc — each a little wrong in its own way. "Gather" walks every
// date onto one timeline, and the formal's two dates become one.
import { useEffect, useRef, useState } from "react";
import { Spine } from "./Spine";
import { SEMESTER, TYPES, type Ev } from "./timeline-data";
import { WindowBar } from "./chrome";

type Src = "chat" | "sheet" | "doc";
/** Which line of which source each event is gathered from, in gathering order. */
const ORDER: { key: string; src: Src; line: number }[] = [
  { key: "ch8", src: "sheet", line: 0 },
  { key: "food", src: "sheet", line: 1 },
  { key: "dues", src: "chat", line: 3 },
  { key: "ch9", src: "sheet", line: 0 },
  { key: "hall", src: "chat", line: 5 },
  { key: "5k", src: "doc", line: 1 },
  { key: "alum", src: "sheet", line: 3 },
  { key: "formal", src: "doc", line: 0 },
];
const ic = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const SRC_ICON: Record<Src, React.ReactNode> = {
  chat: ic("M4 5h16v11H9l-5 4z"),
  sheet: ic("M4 4h16v16H4zM4 10h16M4 15h16M10 4v16"),
  doc: ic("M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"),
};
const SRC_LABEL: Record<Src, string> = { chat: "Group chat", sheet: "Fall calendar v3", doc: "Exec notes" };

const CHAT: { who: string; me?: boolean; t: string }[] = [
  { who: "Tyler", t: "wait is formal the 14th or the 21st??" },
  { who: "Marcus", t: "sheet says 14th" },
  { who: "Eli", t: "nah it moved. ask sam" },
  { who: "Noah", t: "also are dues due THIS friday or next" },
  { who: "Sam", me: true, t: "formal is the 21st, it's in the exec notes" },
  { who: "Kai", t: "halloween thing is sat the 31st right" },
];
const SHEET: [string, string, string][] = [
  ["Mondays", "Chapter meeting", "8pm"],
  ["Sat 10/24", "Food bank", "9am"],
  ["Sat 11/14", "Formal", "7pm"],
  ["Sat 11/14", "Alumni dinner", "6:30"],
];
const DOC = [
  "Formal moved to Nov 21 (venue double-booked the 14th)",
  "5K confirmed for Sat Nov 7, Riverside Park",
  "Need someone to update the sheet",
];

export function ScatteredDemo() {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const done = step >= ORDER.length;

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function gather() {
    if (running) return;
    setStep(0);
    setRunning(true);
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      setStep(n);
      if (n >= ORDER.length) { clearInterval(timer.current!); timer.current = null; setRunning(false); }
    }, 420);
  }
  function reset() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null; setRunning(false); setStep(0);
  }

  const gathered = ORDER.slice(0, step);
  const active = running ? ORDER[step - 1] : null;
  const lit = (src: Src, line: number) => active?.src === src && active.line === line;
  const used = (src: Src, line: number) => gathered.some(g => g.src === src && g.line === line);
  const events: Ev[] = SEMESTER.filter(e => gathered.some(g => g.key === e.key));
  const fresh = active?.key ?? null;
  const formalIn = gathered.some(g => g.key === "formal");

  // Keep the row that just arrived in view inside the timeline's own scroll box.
  useEffect(() => {
    const box = scrollRef.current, row = fresh && box?.querySelector<HTMLElement>(`[data-key="${fresh}"]`);
    if (!box || !row) return;
    const rr = row.getBoundingClientRect(), br = box.getBoundingClientRect();
    if (rr.bottom > br.bottom || rr.top < br.top) box.scrollTo({ top: box.scrollTop + rr.top - br.top - box.clientHeight / 2 + rr.height / 2, behavior: "smooth" });
  }, [fresh]);

  return <div className="bld bld-win tld-scatter">
    <WindowBar path="where this semester's dates live" />
    <div className="tld-scatter-grid">
      <div className={`tld-desk${done ? " is-done" : ""}`}>
        <section className="tld-src tld-chat" aria-label="Group chat">
          <header><span className="ic">{SRC_ICON.chat}</span>{SRC_LABEL.chat}<small>214 unread</small></header>
          <ul>
            {CHAT.map((m, i) => (
              <li key={i} className={`${m.me ? "me" : ""}${lit("chat", i) ? " lit" : ""}${used("chat", i) ? " used" : ""}`}>
                {!m.me && <b>{m.who}</b>}<span>{m.t}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="tld-src tld-xls" aria-label="Spreadsheet">
          <header><span className="ic">{SRC_ICON.sheet}</span>{SRC_LABEL.sheet}<small>edited Sep 9</small></header>
          <table>
            <tbody>
              {SHEET.map((r, i) => (
                <tr key={i} className={`${lit("sheet", i) ? "lit" : ""}${used("sheet", i) ? " used" : ""}${i === 2 && formalIn ? " wrong" : ""}`}>
                  <td className="n">{i + 2}</td>{r.map((c, j) => <td key={j}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="tld-src tld-doc" aria-label="Doc">
          <header><span className="ic">{SRC_ICON.doc}</span>{SRC_LABEL.doc}<small>Oct 5</small></header>
          <ul>
            {DOC.map((t, i) => <li key={i} className={`${lit("doc", i) ? "lit" : ""}${used("doc", i) ? " used" : ""}`}>{t}</li>)}
          </ul>
        </section>
      </div>

      <div className="tld-scatter-tl">
        <div className="tld-scatter-h">
          <p className="kick">Timeline</p>
          {done
            ? <button type="button" className="tld-btn ghost" onClick={reset}>Scatter them again</button>
            : <button type="button" className="tld-btn" onClick={gather} disabled={running}>{running ? "Gathering…" : "Gather the dates"}</button>}
        </div>
        <div className="tld-scroll" ref={scrollRef}>
        <Spine events={events} types={TYPES} fresh={fresh}
          extra={ev => {
            const g = ORDER.find(o => o.key === ev.key);
            return <span className="tld-from">
              from {g ? SRC_LABEL[g.src] : ""}
              {ev.key === "formal" && <em>one date now, not two</em>}
            </span>;
          }}
          empty={<p>Eight dates, three places, and two answers for when formal is. <b>One place would do.</b></p>} />
        </div>
      </div>
    </div>
  </div>;
}
