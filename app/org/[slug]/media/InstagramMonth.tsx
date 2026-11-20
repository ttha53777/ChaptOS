"use client";
import type { InstagramTask } from "../../../data";
import { DOW, dayKey, markerLabel, monthGrid, moveMonth, quietNote } from "@/lib/media/calendar";
import { PaperIcon } from "../../../components/paper/PaperIcon";
import { formatKey } from "./InstagramSnapshot";
import type { PostFormEvent } from "./InstagramPostForm";
export function InstagramMonth({ tasks, events, today, month, onMonth, onSelect }: { tasks: InstagramTask[]; events: PostFormEvent[]; today: string; month: string; onMonth: (month: string) => void; onSelect: (task: InstagramTask) => void }) {
  const setMonth = onMonth;
  const move = (delta: number) => setMonth(moveMonth(month, delta));
  const { year, title, cells, byDay, evByDay, hatched, longest } = monthGrid(month, tasks, events);
  const quiet = quietNote(longest);
  return <div id="igp-month">
    <div className="igp-mh"><button className="igp-iconbtn" aria-label="Previous month" onClick={() => move(-1)}><PaperIcon name="chev-l" /></button><h2>{title} <em>{year}</em></h2><button className="igp-iconbtn" aria-label="Next month" onClick={() => move(1)}><PaperIcon name="chev-r" /></button>{month !== today.slice(0, 7) && <button className="igp-btn soft small" onClick={() => setMonth(today.slice(0, 7))}>Today</button>}
      {quiet && <p className="note">{quiet.lead}<b>{quiet.bold}</b>{quiet.tail}</p>}
    </div>
    <div className="igp-cal" aria-label={`Content calendar for ${month}`}>
      {DOW.map(day => <span key={day} className="dow">{day}</span>)}
      {cells.map((day, i) => day === null ? <div className="igp-cell blank" key={i} /> : <div key={i} className={`igp-cell${dayKey(month, day) === today ? " today" : ""}${hatched.has(day) ? " gap" : ""}`}>
        <span className="dn">{day}</span>
        {(byDay.get(day) ?? []).map(p => <button key={p.id} className={`igp-mk igp-ty-${formatKey(p.type)}${p.status === "posted" ? " done" : ""}`} onClick={() => onSelect(p)} aria-label={markerLabel(p)} title={`${p.title} · ${p.type}`}><i /><span>{p.title}</span></button>)}
        {(evByDay.get(day) ?? []).map(e => <span className="igp-mk ev" key={e.id} title={`Event: ${e.title}`}><i /><span>{e.title}</span></span>)}
      </div>)}
    </div>
  </div>;
}
