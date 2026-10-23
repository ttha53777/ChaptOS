import React from "react";
import type { CalEventType, CalendarEvent } from "../../../data";
import { SectionError } from "./SectionError";
import { PaperIcon, PaperTile } from "../../paper/PaperIcon";
import { compareEvents, formatEventTime, isEventOver } from "@/lib/event-time";
import "../core-cards.css";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "Today" / "Tomorrow" / "in 3 days" / "Oct 30", counted in calendar days. */
function when(date: string, today: string): string {
  const days = Math.round((utc(date).getTime() - utc(today).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `in ${days} days`;
  const d = utc(date);
  return `${MON[d.getUTCMonth()][0]}${MON[d.getUTCMonth()].slice(1).toLowerCase()} ${d.getUTCDate()}`;
}

/**
 * The next thing on the calendar, as a ticket stub. Same events the timeline
 * shows (nothing invented: no RSVP count, the app keeps none). Tapping it opens
 * the This-week peek; the one action is the one that matters on the day —
 * opening check-in — and only for someone who can.
 */
export function UpNext({
  events,
  eventTypes,
  today,
  live,
  onSelect,
  onOpenCheckIn,
  onGoToLive,
  onAddEvent,
  loading = false,
  error = false,
  onRetry,
}: {
  events: CalendarEvent[];
  eventTypes: Map<string, CalEventType>;
  today: string;
  /** The open check-in window, if any: its event and how many are in. */
  live: { eventId: number; here: number } | null;
  onSelect: (event: CalendarEvent) => void;
  /** Absent without MANAGE_ATTENDANCE. */
  onOpenCheckIn?: (event: CalendarEvent) => void;
  onGoToLive?: () => void;
  onAddEvent?: () => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const next = loading || error
    ? undefined
    : [...events].filter(e => e.date >= today && !isEventOver(e)).sort(compareEvents)[0];
  const type = next ? eventTypes.get(next.category) : undefined;
  const d = next ? utc(next.date) : null;
  const time = next ? formatEventTime(next.time, next.schedule) : null;
  const isLive = !!next && live?.eventId === next.id;

  return (
    <section className="card un" aria-label="Up next">
      <div className="card-h">
        <PaperTile icon="clock" tone="sky" />
        <h2>Up next</h2>
        {next && <div className="right"><span className="sub">{when(next.date, today)}</span></div>}
      </div>
      {error ? (
        <SectionError what="the calendar" onRetry={onRetry} />
      ) : (
        <div className="cc-b">
          {loading ? (
            <div className="un-tix un-skel" aria-hidden="true"><div className="un-stub" /><div className="un-bd"><i /><i /></div></div>
          ) : !next ? (
            <div className="un-empty">
              <p>{events.length ? "Nothing coming up on the calendar." : "Nothing on the calendar yet."}</p>
              {onAddEvent && <button type="button" className="un-btn" onClick={onAddEvent}><PaperIcon name="plus" /> Add an event</button>}
            </div>
          ) : (
            <div
              className="un-tix"
              style={(type ? { "--cat": type.color, "--cat-d": type.colorDark ?? type.color } : undefined) as React.CSSProperties | undefined}
            >
              <button type="button" className="un-hit" onClick={() => onSelect(next)} aria-label={`${next.title}, details`} />
              <div className="un-stub" aria-hidden="true">
                <small>{WD[d!.getUTCDay()]}</small>
                <b>{d!.getUTCDate()}</b>
                <small>{MON[d!.getUTCMonth()]}</small>
              </div>
              <div className="un-bd">
                <b>{next.title}</b>
                <span>{[time ?? "All day", next.location].filter(Boolean).join(" · ")}</span>
                {(type || next.mandatory) && (
                  <span className="un-tags">
                    {type && <em className="un-cat">{type.label}</em>}
                    {next.mandatory && <em>Required</em>}
                  </span>
                )}
                {isLive ? (
                  <div className="un-row">
                    <button type="button" className="un-btn live" onClick={onGoToLive}><i aria-hidden="true" /> Check-in open · {live!.here} here</button>
                  </div>
                ) : onOpenCheckIn && next.date === today ? (
                  <div className="un-row">
                    <button type="button" className="un-btn solid" onClick={() => onOpenCheckIn(next)}>Open check-in</button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
