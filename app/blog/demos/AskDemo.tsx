"use client";
// Ask Chapt over the minutes. In the app a model streams its work: a ledger of
// steps, each posting what it found, then an answer whose rows link back to the
// records. This demo plays that shape from canned answers about the made-up
// chapter, and shows the minutes being read alongside: lines light up as a
// step scans them and stay marked where the answer came from.
import { useEffect, useRef, useState } from "react";
import { Spark, WindowBar } from "./chrome";
import { useSeen } from "./hooks";

type Line = { k?: "h" | "li" | "todo" | "done"; t: string };
type Doc = { title: string; date: string; lines: Line[] };

const DOCS = {
  w8: {
    title: "Chapter Meeting — Week 8", date: "Sun, Oct 18",
    lines: [
      { k: "h", t: "Call to order" },
      { t: "Called to order at 8:03 PM by @President. Quorum met: 41 of 52." },
      { k: "h", t: "Officer reports" },
      { k: "li", t: "Treasurer: $6,240 in the account. Four still owe dues." },
      { k: "li", t: "Social: formal is sold out at 120 tickets." },
      { k: "h", t: "Old business" },
      { t: "The grill. Again. Motion to buy a new one, capped at $300." },
      { k: "li", t: "Voted 31–9–4. Motion passes." },
      { k: "done", t: "@Marcus Bell to order the grill by Friday" },
      { k: "todo", t: "@Treasurer to send the dues reminder by Friday" },
      { k: "h", t: "New business" },
      { k: "todo", t: "@Social to send the theme poll by Monday" },
    ],
  },
  w4: {
    title: "Chapter Meeting — Week 4", date: "Sun, Sep 20",
    lines: [
      { k: "h", t: "Treasury report" },
      { t: "Balance is $5,980. Nine members still owe fall dues." },
      { k: "h", t: "Old business" },
      { t: "Mixer with Delta Gamma: date still open." },
      { k: "h", t: "New business" },
      { t: "Formal moves to Nov 14, approved without objection." },
      { k: "todo", t: "@Social to book the venue by Oct 1" },
      { k: "h", t: "Adjourn" },
      { t: "Adjourned at 9:12 PM." },
    ],
  },
} satisfies Record<string, Doc>;
type DocId = keyof typeof DOCS;

type Step = { verb: string; src: string; finding: string; doc: DocId; scan: [number, number]; hits: number[] };
type Row = { kind: "event" | "task" | "money" | "done"; title: string; sub: string; value: string };
type Answer = { q: string; steps: Step[]; verdict: string; rows: Row[]; cite: { doc: DocId; line: number; label: string } };

const ANSWERS: Record<string, Answer> = {
  grill: {
    q: "What did we decide about the grill?",
    steps: [
      { verb: "Searching every meeting's minutes", src: "Minutes", finding: "Week 8 · Oct 18", doc: "w8", scan: [0, 5], hits: [] },
      { verb: "Reading the vote", src: "Minutes", finding: "Passed 31–9–4", doc: "w8", scan: [5, 8], hits: [6, 7] },
      { verb: "Checking who owns it", src: "Tasks", finding: "Marcus · done", doc: "w8", scan: [8, 9], hits: [8] },
    ],
    verdict: "You voted **31–9–4** on Oct 18 to buy a new grill, capped at **$300**. Marcus Bell owned the order, and it's done.",
    rows: [
      { kind: "event", title: "Chapter Meeting — Week 8", sub: "Sun, Oct 18 · Old business", value: "31–9–4" },
      { kind: "money", title: "Spending cap", sub: "Set by the motion", value: "$300" },
      { kind: "done", title: "Order the grill", sub: "Marcus Bell · by Friday", value: "Done" },
    ],
    cite: { doc: "w8", line: 7, label: "Week 8 · Old business" },
  },
  followup: {
    q: "What follow-up came out of the last meeting?",
    steps: [
      { verb: "Finding the last meeting", src: "Chapter", finding: "Week 8 · Oct 18", doc: "w8", scan: [0, 2], hits: [] },
      { verb: "Reading its action items", src: "Minutes", finding: "3 action items", doc: "w8", scan: [2, 12], hits: [8, 9, 11] },
      { verb: "Checking what's been ticked off", src: "Tasks", finding: "1 done · 2 open", doc: "w8", scan: [8, 12], hits: [8, 9, 11] },
    ],
    verdict: "Week 8 left **3 action items**. The grill is ordered; the **dues reminder** and the **theme poll** are still open.",
    rows: [
      { kind: "task", title: "Send the dues reminder", sub: "Treasurer (Andre) · by Friday", value: "Open" },
      { kind: "task", title: "Send the theme poll", sub: "Social (Sam) · by Monday", value: "Open" },
      { kind: "done", title: "Order the grill", sub: "Marcus Bell · by Friday", value: "Done" },
    ],
    cite: { doc: "w8", line: 9, label: "Week 8 · action items" },
  },
  formal: {
    q: "When did we move formal?",
    steps: [
      { verb: "Searching the minutes for “formal”", src: "Minutes", finding: "2 meetings", doc: "w4", scan: [0, 6], hits: [5] },
      { verb: "Checking the latest mention", src: "Minutes", finding: "Week 8 · sold out", doc: "w8", scan: [2, 5], hits: [4] },
    ],
    verdict: "Formal moved to **Nov 14** at the Sep 20 meeting, approved without objection. As of Oct 18 it's **sold out** at 120 tickets.",
    rows: [
      { kind: "event", title: "Chapter Meeting — Week 4", sub: "Sun, Sep 20 · New business", value: "Nov 14" },
      { kind: "event", title: "Chapter Meeting — Week 8", sub: "Sun, Oct 18 · Social report", value: "120 sold" },
    ],
    cite: { doc: "w4", line: 5, label: "Week 4 · New business" },
  },
};
const STARTERS = ["grill", "followup", "formal"] as const;

function route(q: string): string | null {
  const s = q.toLowerCase();
  if (/grill|vote|decid|\$300/.test(s)) return "grill";
  if (/formal|nov|venue|ticket/.test(s)) return "formal";
  if (/follow|open|to-?do|action|task|last (meeting|week)|owe|still/.test(s)) return "followup";
  return null;
}

const Bold = ({ text }: { text: string }) =>
  <>{text.split(/(\*\*[^*]+\*\*)/).map((t, i) => t.startsWith("**") ? <mark key={i}>{t.slice(2, -2)}</mark> : t)}</>;
const ROW_ICON: Record<Row["kind"], string> = { event: "⚑", money: "$", task: "", done: "✓" };

// A line's text with @mentions drawn as the editor's chips.
const Rich = ({ t }: { t: string }) =>
  <>{t.split(/(@(?:Marcus Bell|President|Treasurer|Social))/).map((p, i) =>
    p.startsWith("@") ? <span key={i} className={`chip${/Bell/.test(p) ? "" : " role"}`}>{p.slice(1)}</span> : p)}</>;

type Phase = "thinking" | "answered";
type Run = { q: string; key: string | null; phase: Phase; step: number; ms: number };

export function AskDemo() {
  const root = useRef<HTMLDivElement>(null);
  const seen = useSeen(root);
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [typing, setTyping] = useState(false);
  const [view, setView] = useState<DocId>("w8");
  const [flash, setFlash] = useState<number | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pane = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => clear, []);

  function think(q: string, key = route(q)) {
    const a = key ? ANSWERS[key] : null;
    const steps = a?.steps.length ?? 1;
    const STEP = 1100;
    setTyped("");
    setTyping(false);
    setTraceOpen(false);
    setFlash(null);
    setRun({ q, key, phase: "thinking", step: 0, ms: steps * STEP + 400 });
    if (a) setView(a.steps[0].doc);
    for (let i = 1; i <= steps; i++) {
      at(i * STEP, () => {
        setRun(r => r && { ...r, step: i });
        if (a && i < steps) setView(a.steps[i].doc);
      });
    }
    at(steps * STEP + 400, () => {
      setRun(r => r && { ...r, phase: "answered" });
      if (a) { setView(a.cite.doc); setFlash(a.cite.line); }
    });
  }

  // A starter types itself into the box, as if someone were asking.
  function ask(key: string) {
    clear();
    const q = ANSWERS[key].q;
    setTyping(true);
    setTyped("");
    let t = 250;
    for (let i = 1; i <= q.length; i++) {
      t += q[i - 1] === " " ? 60 : 26 + Math.random() * 36;
      at(t, () => setTyped(q.slice(0, i)));
    }
    at(t + 420, () => think(q, key));
  }

  function submit() {
    if (!typed.trim() || typing) return;
    clear();
    think(typed.trim());
  }

  useEffect(() => {
    if (seen && !started.current) { started.current = true; ask("grill"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen]);

  // Keep the line being read in view inside the pane (never scrolls the page).
  const a = run?.key ? ANSWERS[run.key] : null;
  const active = run?.phase === "thinking" && a ? a.steps[Math.min(run.step, a.steps.length - 1)] : null;
  const focusLine = active ? active.scan[0] : run?.phase === "answered" && flash != null ? flash : null;
  useEffect(() => {
    const box = pane.current;
    const el = focusLine != null ? box?.querySelector<HTMLElement>(`[data-line="${focusLine}"]`) : null;
    if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - 60), behavior: "smooth" });
  }, [focusLine, view]);

  const doc = DOCS[view];
  const doneSteps = a && run ? a.steps.slice(0, run.phase === "answered" ? a.steps.length : run.step) : [];
  const hits = new Set(doneSteps.filter(s => s.doc === view).flatMap(s => s.hits));
  const scanning = active && active.doc === view ? active.scan : null;
  const consulted = [...new Set(doneSteps.concat(active ? [active] : []).map(s => s.src))];
  const thinking = run?.phase === "thinking";
  const answered = run?.phase === "answered";
  const busy = typing || thinking;

  const ledger = (a?.steps ?? [{ verb: "Searching the minutes", src: "Minutes", finding: "No match in this demo" }] as Pick<Step, "verb" | "src" | "finding">[]);

  return <div ref={root} className="bld bld-win bld-ask">
    <WindowBar path="ask chapt · ⌘K" />
    <div className="ak-grid">
      <section className="ak-chat" aria-live="polite">
        <div className="ak-thread">
          {!run ? (
            <div className="ak-home">
              <span className="ak-orb"><Spark /></span>
              <h4>Ask about any meeting</h4>
              <p>Ask Chapt reads your minutes and summaries, then points you to the meeting the answer came from.</p>
            </div>
          ) : (
            <>
              <p className="ak-me">{run.q}</p>
              <div className="ak-by"><Spark /> Ask Chapt{thinking && <span className="ak-dots"><i /><i /><i /></span>}</div>

              {answered && !traceOpen ? (
                <button type="button" className="ak-trace" onClick={() => setTraceOpen(true)}>
                  <span>Thought for {(run.ms / 1000).toFixed(1)}s · {ledger.length} {ledger.length === 1 ? "step" : "steps"}</span>
                  {consulted.map(c => <em key={c}>{c}</em>)}
                  <b>Show</b>
                </button>
              ) : (
                <ol className="ak-ledger">
                  {ledger.map((s, i) => {
                    const st = answered || (run.step > i) ? "done" : run.step === i ? "active" : "pending";
                    return <li key={s.verb} className={st}>
                      <span className="o" aria-hidden />
                      <span className="v">{s.verb}</span>
                      <span className="src">{s.src}</span>
                      {st === "done" && <span className="f">{s.finding}</span>}
                    </li>;
                  })}
                  {answered && <li className="hide"><button type="button" onClick={() => setTraceOpen(false)}>Hide steps</button></li>}
                </ol>
              )}

              {thinking && consulted.length > 0 && (
                <p className="ak-consulted">Consulted {consulted.map(c => <em key={c}>{c}</em>)}</p>
              )}

              {answered && (a ? (
                <div className="ak-ans">
                  <p className="ak-verdict"><Bold text={a.verdict} /></p>
                  <ul className="ak-rows">{a.rows.map((r, i) => (
                    <li key={r.title} style={{ animationDelay: `${120 + i * 110}ms` }} className={r.kind}>
                      <span className="ri" aria-hidden>{ROW_ICON[r.kind]}</span>
                      <span className="rt"><b>{r.title}</b><small>{r.sub}</small></span>
                      <span className="rv">{r.value}</span>
                    </li>
                  ))}</ul>
                  <button type="button" className="ak-cite" onClick={() => { setView(a.cite.doc); setFlash(null); requestAnimationFrame(() => setFlash(a.cite.line)); }}>
                    <span>From</span> {a.cite.label} <i>↗</i>
                  </button>
                </div>
              ) : (
                <div className="ak-ans">
                  <p className="ak-verdict">That one's outside this demo, which only knows a few meetings of a made-up chapter. In your org, Ask Chapt reads your real minutes. Try one of these:</p>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="ak-chips">
          {STARTERS.map(k => (
            <button key={k} type="button" disabled={busy} className={run?.key === k ? "on" : undefined} onClick={() => ask(k)}>{ANSWERS[k].q}</button>
          ))}
        </div>
        <form className={`ak-dock${typing ? " is-typing" : ""}`} onSubmit={e => { e.preventDefault(); submit(); }}>
          <Spark />
          <input
            value={typed}
            readOnly={typing}
            onChange={e => setTyped(e.target.value)}
            placeholder="Ask about past meetings…"
            aria-label="Ask about past meetings"
          />
          {typing && <span className="caret" aria-hidden />}
          <button type="submit" aria-label="Ask" disabled={!typed.trim() || busy}>↑</button>
        </form>
      </section>

      <aside className={`ak-src${thinking ? " is-reading" : ""}`}>
        <div className="ak-srch">
          <span className="k">{thinking ? "Reading" : answered && a ? "Source" : "Minutes"}</span>
          <div className="tabs" role="tablist" aria-label="Meeting minutes">
            {(Object.keys(DOCS) as DocId[]).map(id => (
              <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "on" : undefined} onClick={() => { setView(id); setFlash(null); }}>
                {DOCS[id].title.replace("Chapter Meeting — ", "")}
              </button>
            ))}
          </div>
        </div>
        <div className="ak-doc" ref={pane}>
          <p className="ttl">{doc.title}<small>{doc.date}</small></p>
          <ol>
            {doc.lines.map((l, i) => {
              const cls = [l.k ?? "p",
                scanning && i >= scanning[0] && i < scanning[1] ? "scan" : "",
                hits.has(i) ? "hit" : "",
                answered && flash === i ? "cite" : ""].filter(Boolean).join(" ");
              return <li key={`${view}-${i}`} data-line={i} className={cls} style={scanning ? { animationDelay: `${(i - scanning[0]) * 110}ms` } : undefined}>
                {(l.k === "todo" || l.k === "done") && <span className="cb" aria-hidden />}
                <span className="tx"><Rich t={l.t} /></span>
              </li>;
            })}
          </ol>
        </div>
      </aside>
    </div>
  </div>;
}
