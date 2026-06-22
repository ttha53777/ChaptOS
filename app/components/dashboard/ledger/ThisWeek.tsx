import React from "react";
import { fmtRange, taskAssigneeLabel, type CalendarEvent, type Task } from "../../../data";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function dayNum(iso: string): number {
  return Number(iso.split("-")[2]);
}

type WeekItem = {
  date: string;
  title: string;
  meta: string;
  kind: "event" | "deadline";
  today: boolean;
};

/**
 * "This week" agenda — mandatory events + deadlines due in the current ISO week
 * (already filtered by the page's weeklyDigest), merged and date-sorted.
 * Read-only; the header All/Add link to the existing deadline drawer/modal so
 * deadline management stays reachable. Carries `id="sec-deadlines"`.
 */
export function ThisWeek({
  events,
  deadlines,
  weekStart,
  weekEnd,
  today,
  onAll,
  onAddDeadline,
}: {
  events: CalendarEvent[];
  deadlines: Task[];
  weekStart: string;
  weekEnd: string;
  today: string;
  onAll?: () => void;
  onAddDeadline?: () => void;
}) {
  const items: WeekItem[] = [
    ...events.map((e): WeekItem => ({
      date: e.date,
      title: e.title,
      meta: [e.time, e.location, e.mandatory ? "mandatory" : null].filter(Boolean).join(" · "),
      kind: "event",
      today: e.date === today,
    })),
    ...deadlines
      .filter(d => d.dueDate != null)
      .map((d): WeekItem => ({
        date: d.dueDate as string,
        title: d.title,
        meta: taskAssigneeLabel(d),
        kind: "deadline",
        today: d.dueDate === today,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section id="sec-deadlines" className={`card${onAll ? " cursor-pointer" : ""}`} aria-label="This week" onClick={onAll}>
      <div className="card-h">
        <h2>This week</h2>
        <div className="right">
          <span className="sub">{fmtRange(weekStart, weekEnd)}</span>
          {onAddDeadline && <button type="button" className="card-act" title="Add Deadline" aria-label="Add Deadline" onClick={(e) => { e.stopPropagation(); onAddDeadline(); }}>+ Add</button>}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="rail-empty">Nothing on the agenda this week.</div>
      ) : (
        items.map((it, i) => (
          <div key={`${it.kind}-${i}`} className={it.today ? "week-item today" : "week-item"}>
            <div className="day">{weekday(it.date)}<b>{dayNum(it.date)}</b></div>
            <div className="what">
              <p className="t">
                {it.title}
                {it.kind === "deadline" && <span className="ddl-pill">DEADLINE</span>}
                {it.today && <span className="today-pill">TODAY</span>}
              </p>
              {it.meta && <p className="m">{it.meta}</p>}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
