"use client";

// Reasons (_design/Ask Chapt Answer System Mock.html#reasons) — "why is X
// flagged for attendance?" as a case file. The folder draws the evidence once:
// the gauge against the org's bar, every mandatory meeting this semester, and
// the rest of their record. Each reason card is one of the model's rows; hovering
// or focusing it lights the panel it rests on. "Fair" lists what was left out,
// and "The way back" is arithmetic over the meetings still on the calendar. All
// numbers are the server's (lib/ai-shapes-reasons.ts).

import { useState, type CSSProperties } from "react";

import { IcArrow, IcTick } from "../icons";
import type { AnswerRow, ReasonPanel, ReasonsShape } from "../types";
import { dayNum, fmtDay, initials, iv, monShort, type RowHandlers } from "./common";

const STATE_MARK: Record<ReasonsShape["strip"][number]["state"], string> = {
  there: "", missed: "✕", excused: "E", unrecorded: "?", ahead: "",
};
const STATE_WORD: Record<ReasonsShape["strip"][number]["state"], string> = {
  there: "there", missed: "missed", excused: "excused", unrecorded: "not recorded yet", ahead: "still to come",
};

function standing(g: ReasonsShape["gauge"]): { label: string; tone: "watch" | "now" | "good" } {
  if (g.value < g.atRisk) return { label: "Under bar", tone: "watch" };
  if (g.watch != null && g.value < g.watch) return { label: "On watch", tone: "now" };
  return { label: "On track", tone: "good" };
}

/** Months the strip spans, each with how many meetings fall in it. */
function months(strip: ReasonsShape["strip"]): Array<{ mon: string; n: number }> {
  const out: Array<{ mon: string; n: number }> = [];
  for (const m of strip) {
    const mon = monShort(m.date);
    if (out.length && out[out.length - 1].mon === mon) out[out.length - 1].n++;
    else out.push({ mon, n: 1 });
  }
  return out;
}

/** The latest run of consecutive misses (ignoring excused / unrecorded), as strip indexes. */
function lastRun(strip: ReasonsShape["strip"]): [number, number] | null {
  let end = -1, start = -1;
  for (let i = strip.length - 1; i >= 0; i--) {
    const s = strip[i].state;
    if (s === "missed") { if (end < 0) end = i; start = i; continue; }
    if (s === "there" && end >= 0) break;
  }
  return end >= 0 && end > start ? [start, end] : null;
}

export function ReasonsSheet({ shape, rows, h }: { shape: ReasonsShape; rows: AnswerRow[]; h: RowHandlers }) {
  const [lit, setLit] = useState<ReasonPanel | null>(null);
  const g = shape.gauge;
  const st = standing(g);
  const first = shape.subject.name.split(/\s+/)[0];
  const run = lastRun(shape.strip);
  const peekEvent = (id: number, date: string) => h.onPeek({ kind: "event", title: fmtDay(date), ref: { type: "event", id } });
  const peekMember = () => h.onPeek({ kind: "person", title: shape.subject.name, ref: { type: "member", id: shape.subject.id } });
  const on = (p: ReasonPanel) => (lit === p ? " on" : "");
  const gap = Math.max(0, g.atRisk - g.value);

  return (
    <div className="rz in in-3">
      <div className={`rz-case t-${st.tone}${lit ? " lit" : ""}`}>
        <span className="rz-tab"><i />Case · {st.label.toLowerCase()}</span>
        <div className="rz-who">
          <span className="rz-av">{initials(shape.subject.name)}</span>
          <span className="rz-nm"><b>{shape.subject.name}</b><span>{shape.subject.role || "Member"} · joined {fmtDay(shape.subject.joinedAt)} {shape.subject.joinedAt.slice(0, 4)}</span></span>
          <span className="rz-stamp">{st.label}{gap > 0 && <small>by {gap} pts</small>}</span>
        </div>

        <div className={`rz-ev${on("gauge")}`}>
          <span className="shp-kicker rz-k">Attendance <em>{g.attended} of {g.counted} counted</em></span>
          <div className="gz" style={{ ["--v" as string]: g.value, ["--bar" as string]: g.atRisk } as CSSProperties}>
            <span className="gz-bar"><span>Your bar · {g.atRisk}%</span></span>
            <div className="gz-trk"><span className="gz-fill" />{gap > 0 && <span className="gz-gap" />}</div>
            <span className="gz-v">{g.value}%</span>
          </div>
          <div className="gz-ax"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        </div>

        {shape.strip.length > 0 && (
          <div className={`rz-ev${on("strip")}`}>
            <span className="shp-kicker rz-k">Mandatory meetings this term {run && <em>{run[1] - run[0] + 1} in a row</em>}</span>
            <div className="mts" style={{ gridTemplateColumns: `repeat(${shape.strip.length}, minmax(0, 1fr))` }}>
              {months(shape.strip).map((m, i, all) => {
                const startCol = all.slice(0, i).reduce((s, x) => s + x.n, 0) + 1;
                return <span key={`${m.mon}-${i}`} className="mo" style={{ gridColumn: `${startCol} / span ${m.n}` }}>{m.mon}</span>;
              })}
              {run && <span className="mbr" style={{ gridColumn: `${run[0] + 1} / ${run[1] + 2}` }}><span>since {fmtDay(shape.strip[run[0]].date)}</span></span>}
              {shape.strip.map((m, i) => (
                <button
                  key={m.eventId}
                  type="button"
                  className={`mt ${m.state}`}
                  style={{ ...iv(i), gridRow: 3 }}
                  title={`${fmtDay(m.date)} · ${STATE_WORD[m.state]}`}
                  aria-label={`${fmtDay(m.date)}, ${STATE_WORD[m.state]}`}
                  onClick={() => peekEvent(m.eventId, m.date)}
                >
                  {m.state === "there" ? <IcTick size={10} /> : STATE_MARK[m.state]}
                </button>
              ))}
              {shape.strip.map(m => <span key={`d${m.eventId}`} className="md">{dayNum(m.date)}</span>)}
            </div>
            <div className="mkey">
              <span><i className="k-there" />There</span><span><i className="k-missed" />Missed</span>
              <span><i className="k-dash" />Excused · still to come</span><span><i className="k-unrec" />Not recorded yet</span>
            </div>
          </div>
        )}

        {shape.rest.length > 0 && (
          <div className={`rz-ev${on("rest")}`}>
            <span className="shp-kicker rz-k">The rest of their record</span>
            <div className="rz-ok">
              {shape.rest.map(r => (
                <span key={r.label} className={r.ok ? "" : "no"}>
                  <i>{r.ok ? <IcTick size={10} /> : "!"}</i><b>{r.value}</b>{r.label}{r.note ? ` · ${r.note}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rz-list">
        {rows.map((r, i) => (
          <button
            key={`${r.title}-${i}`}
            type="button"
            className={`rz-c${i === h.selectedRow ? " sel" : ""}${r.panel && lit === r.panel ? " on" : ""}`}
            style={iv(i)}
            onMouseEnter={() => setLit(r.panel ?? null)}
            onMouseLeave={() => setLit(null)}
            onFocus={() => setLit(r.panel ?? null)}
            onBlur={() => setLit(null)}
            onClick={() => h.act(r)}
          >
            <span className="rz-n">{i + 1}</span>
            <span className="rz-b"><b>{r.title}</b>{r.subtitle && <span>{r.subtitle}</span>}</span>
          </button>
        ))}
      </div>

      {shape.excluded.length > 0 && (
        <div className="rz-nc">
          <span className="shp-kicker">Looked at, not counted against {first}</span>
          <ul>
            {shape.excluded.map(e => (
              <li key={e.eventId}>
                <button type="button" className="rz-date" onClick={() => peekEvent(e.eventId, e.date)}>{fmtDay(e.date)}</button>
                {e.why === "excused" ? `excused${e.reason ? `: ${e.reason}` : ""}` : "no attendance taken yet, so it doesn't count"}
              </li>
            ))}
          </ul>
          <span className="rz-fair">Fair<small>{shape.excluded.length} left out</small></span>
        </div>
      )}

      {shape.pathBack && g.value < g.atRisk && (
        <div className="rz-path">
          <span className="shp-kicker">The way back</span>
          <b>
            {shape.pathBack.outcomes[0].clears
              ? shape.pathBack.outcomes[1]?.clears ? `${first} can miss one and still clear the bar.` : `${first} clears the bar only with a clean run.`
              : `Even a clean run won't get ${first} over the bar this term.`}
          </b>
          <p>{shape.pathBack.left} mandatory {shape.pathBack.left === 1 ? "meeting is" : "meetings are"} still on the calendar.</p>
          {shape.pathBack.outcomes.map((o, oi) => (
            <div key={oi} className={`pb${o.clears ? " ok" : ""}`}>
              <span className="dots">{Array.from({ length: shape.pathBack!.left }, (_, k) => <i key={k} className={k < o.attend ? "" : "x"} />)}</span>
              <span className="lb"><b>{o.attend === shape.pathBack!.left ? `Makes all ${o.attend}` : "Misses one"}</b> → {o.attended} of {o.counted}</span>
              <span className={`rz-pill${o.clears ? " ok" : ""}`}>{o.pct}% · {o.clears ? "clears it" : "still under"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rz-act">
        {h.onAsk && (
          <button type="button" className="sp-go" onClick={() => h.onAsk!(`Draft a task for someone to check in with ${shape.subject.name} about attendance this week`)}>
            Draft a check-in task<IcArrow />
          </button>
        )}
        <button type="button" className="chip" onClick={peekMember}>Open {first}&apos;s card</button>
      </div>
    </div>
  );
}
