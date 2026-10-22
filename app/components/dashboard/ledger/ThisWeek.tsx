import React, { useState } from "react";
import { fmtRange, taskAssigneeLabel, type CalEventType, type CalendarEvent, type Task } from "../../../data";
import { SectionError } from "./SectionError";
import { PaperIcon, PaperTile } from "../../paper/PaperIcon";
import type { WeekPeekTarget } from "./WeekItemPeek";
import { compareEvents, formatEventTime, isEventOver } from "@/lib/event-time";
import "../week-card.css";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
/** The seven ISO dates from `start` (the week's Monday). */
function weekDays(start: string): string[] {
  const s = utc(start);
  return Array.from({ length: 7 }, (_, i) => new Date(s.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

type WeekItem = {
  date: string;
  title: string;
  /** Left column of the row: the start time, "All day", or "Due". */
  when: string;
  meta: string;
  kind: "event" | "deadline";
  /** An event that has already finished. The week runs Monday–Sunday, so by
   *  midweek half the agenda is behind us and reads the same as what's ahead
   *  without this. Deadlines never set it — an overdue task isn't "over". */
  over: boolean;
  /** The record behind the row, handed straight to the peek sheet. Kept on the
   *  item rather than re-looked-up by id: the two kinds live in different lists,
   *  and an id alone would need a lookup that can miss. */
  target: WeekPeekTarget;
  /** The event's category, for the tag beside the title and the row's color bar.
   *  Null for deadlines (they already carry DEADLINE) and for a slug the org no
   *  longer defines. */
  category: CalEventType | null;
};

/** Both theme colors ride along as vars; the stylesheet picks the one for the active theme. */
const catVars = (c: CalEventType | null) =>
  (c ? { "--cat": c.color, "--cat-d": c.colorDark ?? c.color } : undefined) as React.CSSProperties | undefined;

/**
 * "This week" — _design/Dashboard Universal Paper Mock.html, "week". A Monday–
 * Sunday strip with a dot per item on its day; picking a day lists that day's
 * events and deadlines (already filtered to the ISO week by the page's
 * weeklyDigest). Rows open the peek sheet; "All" opens the deadline drawer so
 * deadline management stays reachable. Carries `id="sec-deadlines"`.
 */
export function ThisWeek({
  events,
  deadlines,
  weekStart,
  weekEnd,
  today,
  onAll,
  onSelect,
  eventTypes,
  calendarEmpty = false,
  onAddEvent,
  loading = false,
  error = false,
  onRetry,
}: {
  events: CalendarEvent[];
  deadlines: Task[];
  weekStart: string;
  weekEnd: string;
  today: string;
  onAll?: () => void;
  /** Opens the detail sheet for one row; without it the rows stay inert text. */
  onSelect?: (target: WeekPeekTarget) => void;
  /** Per-org event categories keyed by slug; drives the category tag and dot color. */
  eventTypes?: Map<string, CalEventType>;
  /** True when the calendar has no events at all, not merely none this week.
   *  "Nothing on the agenda this week" is the right answer for a quiet week and
   *  the wrong one for a calendar nobody has opened yet. */
  calendarEmpty?: boolean;
  /** Adds an event. Undefined without MANAGE_EVENTS (or when the org doesn't
   *  run the events workflow) — the copy stands, the button doesn't. */
  onAddEvent?: () => void;
  /** The week is assembled from two sections (calendar + deadlines); true until
   *  BOTH land. An empty agenda is a real answer here, so it must not be given
   *  while either half is still in flight. */
  loading?: boolean;
  /** Either half failed. Takes precedence over `loading`, which stays true for a
   *  failed section (it never joins `loadedSections`). */
  error?: boolean;
  onRetry?: () => void;
}) {
  const items: WeekItem[] = [
    ...events.map((e): WeekItem => ({
      date: e.date,
      title: e.title,
      when: formatEventTime(e.time, e.schedule)?.split(/\s*[–-]\s*/)[0] ?? "All day",
      meta: [e.location, e.mandatory ? "mandatory" : null].filter(Boolean).join(" · "),
      kind: "event",
      over: isEventOver(e),
      target: { kind: "event", event: e },
      category: eventTypes?.get(e.category) ?? null,
    })),
    ...deadlines
      .filter(d => d.dueDate != null)
      .map((d): WeekItem => ({
        date: d.dueDate as string,
        title: d.title,
        when: "Due",
        meta: taskAssigneeLabel(d),
        kind: "deadline",
        over: false,
        target: { kind: "deadline", task: d },
        category: null,
      })),
  // Same day: all-day items (deadlines) first, then events by start time.
  ].sort((a, b) => compareEvents(a.target.kind === "event" ? a.target.event : a, b.target.kind === "event" ? b.target.event : b));

  const days = weekDays(weekStart);
  const byDay = new Map(days.map(d => [d, items.filter(it => it.date === d)]));
  // Open on today when something's on; otherwise the next day that has anything,
  // so the card answers "what's coming" without a tap.
  const home = days.includes(today) ? today : days[0];
  const firstBusy = days.find(d => d >= home && byDay.get(d)!.length > 0);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked && days.includes(picked) ? picked : byDay.get(home)!.length ? home : firstBusy ?? home;
  const selItems = byDay.get(sel) ?? [];
  const selDate = utc(sel);
  const selLabel = sel === today ? "Today" : `${WD_LONG[selDate.getUTCDay()]}, ${MON[selDate.getUTCMonth()]} ${selDate.getUTCDate()}`;
  const nextUp = items.find(it => it.date > today && !it.over);

  const addBtn = (label: string) => onAddEvent && (
    <button type="button" className="wk-add" onClick={onAddEvent}>{label}</button>
  );

  return (
    <section id="sec-deadlines" className="card wk" aria-label="This week">
      <div className="card-h">
        <PaperTile icon="cal" tone="butter" />
        <h2>This week</h2>
        <div className="right">
          {/* The week range is computed from the clock, not fetched — it is
              already true, so it stays put while the agenda loads. */}
          <span className="sub">{fmtRange(weekStart, weekEnd)}</span>
          {onAll && !loading && !error && (
            <button type="button" className="wk-lnk" onClick={onAll}>All <PaperIcon name="arrow-r" /></button>
          )}
        </div>
      </div>
      {error ? (
        <SectionError what="this week's agenda" onRetry={onRetry} />
      ) : (
        <div className="wk-b">
          <div className="wk-strip" role="tablist" aria-label="Days this week">
            {days.map(d => {
              const dt = utc(d);
              const its = byDay.get(d)!;
              const cls = ["wk-day", d === today && "today", d < today && "past", d === sel && "sel"].filter(Boolean).join(" ");
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={d === sel}
                  aria-label={`${WD_LONG[dt.getUTCDay()]}${its.length ? `, ${its.length} item${its.length === 1 ? "" : "s"}` : ""}`}
                  className={cls}
                  onClick={() => setPicked(d)}
                  disabled={loading}
                >
                  <span className="dw">{d === today ? "TODAY" : WD[dt.getUTCDay()]}</span>
                  <span className="dn">{dt.getUTCDate()}</span>
                  <span className="dots">
                    {its.slice(0, 3).map((it, i) => (
                      <i key={i} className={it.kind === "deadline" ? "ddl" : it.category ? "cat" : ""} style={catVars(it.category)} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="wk-list">
            {loading ? (
              <div className="wk-skel" aria-busy="true" aria-label="Loading this week">
                {[0, 1].map(i => <i key={i} className="skel" />)}
              </div>
            ) : (
              <>
                <div className="wk-h">{selLabel}</div>
                {selItems.length > 0 ? selItems.map((it, i) => {
                  const body = (
                    <>
                      <span className="tm">{it.when}</span>
                      <span className={`bar${it.kind === "deadline" ? " ddl" : it.category ? " cat" : ""}`} style={catVars(it.category)} />
                      <span className="what">
                        <b>
                          <span className="ttl">{it.title}</span>
                          {it.kind === "deadline" && <span className="ddl-pill">DEADLINE</span>}
                          {it.category && <span className="cat-pill" style={catVars(it.category)}>{it.category.label.toUpperCase()}</span>}
                          {it.over && <span className="ended-pill">ENDED</span>}
                        </b>
                        {it.meta && <small>{it.meta}</small>}
                      </span>
                      {onSelect && <span className="go">Details</span>}
                    </>
                  );
                  const cls = ["wk-ev", it.over && "over"].filter(Boolean).join(" ");
                  return onSelect ? (
                    <button key={`${it.kind}-${i}`} type="button" className={cls} onClick={() => onSelect(it.target)}>{body}</button>
                  ) : (
                    <div key={`${it.kind}-${i}`} className={cls}>{body}</div>
                  );
                }) : calendarEmpty && items.length === 0 ? (
                  <div className="wk-empty hello">
                    <PaperIcon name="sun" />
                    <span>A blank week, all yours. {addBtn("Add your first event")}{!onAddEvent && "Events land on their day once they're on the calendar."}</span>
                  </div>
                ) : items.length === 0 ? (
                  <div className="wk-empty calm"><PaperIcon name="mug" /> <span>Quiet week. Nothing on the agenda.</span></div>
                ) : (
                  <div className="wk-empty">
                    <span>
                      Nothing on {sel === today ? "today" : "this day"}.
                      {nextUp && sel <= today && <> Next up: <b>{nextUp.title}</b>, {WD_LONG[utc(nextUp.date).getUTCDay()]}.</>}
                    </span>
                    {addBtn("Add something")}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
