"use client";
import type { InstagramTask } from "../../data";
import { instagramGaps } from "@/lib/instagram-planner";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { formatKey } from "./InstagramSnapshot";
import type { PostFormEvent } from "./InstagramPostForm";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function InstagramMonth({ tasks, events, today, month, onMonth, onSelect }: { tasks: InstagramTask[]; events: PostFormEvent[]; today: string; month: string; onMonth: (month: string) => void; onSelect: (task: InstagramTask) => void }) {
  const setMonth = onMonth;
  const [year, mo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, mo - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  const move = (delta: number) => setMonth(new Date(Date.UTC(year, mo - 1 + delta, 1)).toISOString().slice(0, 7));
  const byDay = new Map<number, InstagramTask[]>();
  tasks.filter(p => p.dueDate.startsWith(month)).forEach(p => { const d = Number(p.dueDate.slice(8)); byDay.set(d, [...(byDay.get(d) ?? []), p]); });
  const linked = new Set(tasks.map(p => p.calendarEventId));
  const evByDay = new Map<number, PostFormEvent[]>();
  events.filter(e => linked.has(e.id) && e.date.startsWith(month)).forEach(e => { const d = Number(e.date.slice(8)); evByDay.set(d, [...(evByDay.get(d) ?? []), e]); });
  const { hatched, longest } = instagramGaps([...byDay.keys()]);
  const cells = Array.from({ length: Math.ceil((first + length) / 7) * 7 }, (_, i) => i < first || i >= first + length ? null : i - first + 1);
  return <div id="igp-month">
    <div className="igp-mh"><button className="igp-iconbtn" aria-label="Previous month" onClick={() => move(-1)}><PaperIcon name="chev-l" /></button><h2>{new Date(Date.UTC(year, mo - 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })} <em>{year}</em></h2><button className="igp-iconbtn" aria-label="Next month" onClick={() => move(1)}><PaperIcon name="chev-r" /></button>{month !== today.slice(0, 7) && <button className="igp-btn soft small" onClick={() => setMonth(today.slice(0, 7))}>Today</button>}
      {longest > 0 && <p className="note">Longest quiet stretch this month: <b>{longest} day{longest === 1 ? "" : "s"}</b>{longest >= 5 ? " — hatched" : ""}</p>}
    </div>
    <div className="igp-cal" aria-label={`Content calendar for ${month}`}>
      {DAYS.map(day => <span key={day} className="dow">{day}</span>)}
      {cells.map((day, i) => day === null ? <div className="igp-cell blank" key={i} /> : <div key={i} className={`igp-cell${`${month}-${String(day).padStart(2, "0")}` === today ? " today" : ""}${hatched.has(day) ? " gap" : ""}`}>
        <span className="dn">{day}</span>
        {(byDay.get(day) ?? []).map(p => <button key={p.id} className={`igp-mk igp-ty-${formatKey(p.type)}${p.status === "posted" ? " done" : ""}`} onClick={() => onSelect(p)} aria-label={`${p.title}, ${p.type}, ${p.dueDate}${p.status === "posted" ? ", posted" : ""}`} title={`${p.title} · ${p.type}`}><i /><span>{p.title}</span></button>)}
        {(evByDay.get(day) ?? []).map(e => <span className="igp-mk ev" key={e.id} title={`Event: ${e.title}`}><i /><span>{e.title}</span></span>)}
      </div>)}
    </div>
  </div>;
}
