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
 * "This week" agenda — every calendar event plus deadlines due in the current
 * ISO week (already filtered by the page's weeklyDigest), merged and
 * date-sorted. Mandatory events are tagged as such in the meta line rather than
 * being the only ones shown.
 * Read-only; the header All link to the existing deadline drawer so
 * deadline management stays reachable. Carries `id="sec-deadlines"`.
 */
export function ThisWeek({
  events,
  deadlines,
  weekStart,
  weekEnd,
  today,
  onAll,
  calendarEmpty = false,
  onAddEvent,
}: {
  events: CalendarEvent[];
  deadlines: Task[];
  weekStart: string;
  weekEnd: string;
  today: string;
  onAll?: () => void;
  /** True when the calendar has no events at all, not merely none this week.
   *  "Nothing on the agenda this week" is the right answer for a quiet week and
   *  the wrong one for a calendar nobody has opened yet. */
  calendarEmpty?: boolean;
  /** Adds the first event. Undefined without MANAGE_EVENTS (or when the org
   *  doesn't run the events workflow) — the copy stands, the button doesn't. */
  onAddEvent?: () => void;
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
        </div>
      </div>
      {items.length === 0 ? (
        <div className="rail-empty">
          {calendarEmpty ? "No events on the calendar yet." : "Nothing on the agenda this week."}
          {calendarEmpty && onAddEvent && (
            <button
              type="button"
              className="a"
              onClick={(e) => { e.stopPropagation(); onAddEvent(); }}
            >
              Add your first event →
            </button>
          )}
        </div>
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
