import React from "react";
import type { CalEventType, CalendarEvent } from "../../../data";
import { SectionError } from "./SectionError";
import { PaperIcon, PaperTile, type PaperIconName } from "../../paper/PaperIcon";
import { formatEventTime, startInstant } from "@/lib/event-time";
import { paperCatVars } from "@/lib/event-hue";
import { agendaPreview, countdown, factsOf, lastPast, untilLabel, upcoming, type Fact } from "@/lib/up-next";
import { useNow } from "../../../hooks/useNow";
import "../core-cards.css";

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const title = (s: string) => s[0] + s.slice(1).toLowerCase();
const FALLBACK_CAT_COLOR = "#8a8f98";
/** How many of the following events ride under the ticket. */
const AFTER = 3;

/** "Today" / "Tomorrow" / "in 3 days" / "Oct 30", counted in calendar days. */
function when(date: string, today: string): string {
  const days = Math.round((utc(date).getTime() - utc(today).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `in ${days} days`;
  const d = utc(date);
  return `${title(MON[d.getUTCMonth()])} ${d.getUTCDate()}`;
}

const FACT_ICON: Record<Fact["kind"], PaperIconName> = {
  dress: "spark", theme: "star", guests: "people", capacity: "door", collabs: "hand", supplies: "bag", directions: "key",
  checklist: "check", budget: "wallet", contact: "chat", links: "link", custom: "note",
};

/** The type's colour as the paper --pc* set, on whatever element carries an event. */
function toneOf(types: Map<string, CalEventType>, category: string): React.CSSProperties {
  const t = types.get(category);
  return paperCatVars(category, t?.colorDark ?? t?.color ?? FALLBACK_CAT_COLOR) as React.CSSProperties;
}

/** A little clock face set to the event's start, for the day itself. */
function ClockFace({ at }: { at: Date }) {
  const h = at.getHours() % 12, m = at.getMinutes();
  const hand = (deg: number, len: number, w: number) => {
    const r = ((deg - 90) * Math.PI) / 180;
    return <line x1="23" y1="23" x2={23 + len * Math.cos(r)} y2={23 + len * Math.sin(r)} stroke="currentColor" strokeWidth={w} strokeLinecap="round" />;
  };
  return (
    <svg className="un-face" viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="23" cy="23" r="21" className="rim" />
      {Array.from({ length: 12 }, (_, i) => {
        const r = (i * 30 * Math.PI) / 180;
        return <line key={i} className="tick" x1={23 + 17 * Math.cos(r)} y1={23 + 17 * Math.sin(r)} x2={23 + 19 * Math.cos(r)} y2={23 + 19 * Math.sin(r)} />;
      })}
      {hand((h + m / 60) * 30, 10, 2.4)}
      {hand(m * 6, 15, 1.6)}
      <circle cx="23" cy="23" r="2" fill="currentColor" />
    </svg>
  );
}

/**
 * The next thing on the calendar, as an admission ticket: a dated stub, what to
 * know before you go (the event's own More details and the agenda it was seeded
 * with), and how far off it is. Nothing invented: no RSVP count, the app keeps
 * none. Wide (the main column) it shows the countdown beside the ticket and the
 * three events after it; narrow (the rail, a phone) a container query folds it
 * to a compact stub.
 *
 * The event whose check-in is open is skipped: the live band at the top of the
 * dashboard carries it, so Up next moves on to the one after. Tapping the
 * ticket opens the This-week peek; the one action is opening check-in on the
 * day, and only for someone who can.
 */
export function UpNext({
  events,
  eventTypes,
  today,
  liveEventId,
  onSelect,
  onOpenCheckIn,
  onAddEvent,
  onAll,
  loading = false,
  error = false,
  onRetry,
}: {
  events: CalendarEvent[];
  eventTypes: Map<string, CalEventType>;
  today: string;
  /** The event with a check-in window open, if any; it lives in the live band instead. */
  liveEventId: number | null;
  onSelect: (event: CalendarEvent) => void;
  /** Absent without MANAGE_ATTENDANCE. */
  onOpenCheckIn?: (event: CalendarEvent) => void;
  onAddEvent?: () => void;
  /** The whole calendar (the Timeline). */
  onAll?: () => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const now = useNow();
  const list = loading || error ? [] : upcoming(events, today, now, liveEventId);
  const next = list[0];

  return (
    <section className="card un" aria-label="Up next">
      <div className="card-h">
        <PaperTile icon="clock" tone="sky" />
        <h2>Up next</h2>
        {next && <div className="right">
          {onAll
            ? <button type="button" className="rd-all" onClick={onAll}>{when(next.date, today)} <PaperIcon name="arrow-r" /></button>
            : <span className="sub">{when(next.date, today)}</span>}
        </div>}
      </div>
      {error ? (
        <SectionError what="the calendar" onRetry={onRetry} />
      ) : (
        <div className="cc-b un-b">
          {loading ? (
            <div className="un-tix un-skel" aria-hidden="true">
              <div className="un-stub" />
              <div className="un-bd"><i /><i /><i /></div>
              <div className="un-cd"><i /><i /></div>
            </div>
          ) : !next ? (
            <Empty events={events} today={today} now={now} onAddEvent={onAddEvent} />
          ) : (
            <>
              <Ticket event={next} types={eventTypes} today={today} now={now} onSelect={onSelect} onOpenCheckIn={onOpenCheckIn} />
              {list.length > 1 && (
                <div className="un-after">
                  <p className="un-after-h">After that</p>
                  <div className="un-minis">
                    {list.slice(1, 1 + AFTER).map((e, i) => {
                      const d = utc(e.date);
                      const time = formatEventTime(e.time, e.schedule);
                      return (
                        <button key={e.id} type="button" className="un-mini" style={{ ...toneOf(eventTypes, e.category), ["--i" as string]: i }} onClick={() => onSelect(e)}>
                          <span className="d" aria-hidden="true"><small>{WD[d.getUTCDay()]}</small><b>{d.getUTCDate()}</b></span>
                          <span className="t">
                            <b>{e.title}</b>
                            <span>{[when(e.date, today), time ?? "All day"].join(" · ")}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Ticket({ event, types, today, now, onSelect, onOpenCheckIn }: {
  event: CalendarEvent;
  types: Map<string, CalEventType>;
  today: string;
  now: Date;
  onSelect: (event: CalendarEvent) => void;
  onOpenCheckIn?: (event: CalendarEvent) => void;
}) {
  const type = types.get(event.category);
  const d = utc(event.date);
  const time = formatEventTime(event.time, event.schedule);
  const facts = factsOf(event.details);
  const agenda = agendaPreview(event.notesSeed);
  const cd = countdown(event, today, now);
  const start = cd.kind === "today" ? startInstant(event) : null;
  const bare = !facts.length && !agenda;

  return (
    <div className={`un-tix${bare ? " bare" : ""}`} style={toneOf(types, event.category)}>
      <button type="button" className="un-hit" onClick={() => onSelect(event)} aria-label={`${event.title}, details`} />
      <div className="un-stub" aria-hidden="true">
        <span className="adm">ADMIT ONE</span>
        <small>{WD[d.getUTCDay()]}</small>
        <b>{d.getUTCDate()}</b>
        <small>{MON[d.getUTCMonth()]}</small>
        <span className="yr">{d.getUTCFullYear()}</span>
      </div>

      <div className="un-bd">
        {(type || event.mandatory) && (
          <span className="un-tags">
            {type && <em className="un-cat">{type.label}</em>}
            {event.mandatory && <em className="un-req">Required</em>}
          </span>
        )}
        <b className="un-title">{event.title}</b>
        <span className="un-meta">
          <span><PaperIcon name="clock" />{time ?? "All day"}</span>
          {event.location && <span><PaperIcon name="pin" />{event.location}</span>}
        </span>
        {facts.length > 0 && (
          <span className="un-facts">
            {facts.map(f => (
              <span key={f.kind} className={`un-fact${f.open ? " open" : ""}`}>
                <PaperIcon name={FACT_ICON[f.kind]} />
                <span>{f.label} <b>{f.value}</b></span>
              </span>
            ))}
          </span>
        )}
        {agenda && (
          <div className="un-pad">
            <span className="h">Agenda</span>
            <ol>
              {agenda.items.map((t, i) => <li key={i}>{t}</li>)}
              {agenda.more > 0 && <li className="more">+ {agenda.more} more</li>}
            </ol>
          </div>
        )}
      </div>

      <div className="un-cd">
        {cd.kind === "days" ? (
          <div>
            <p className="lbl">Starts in</p>
            <p className="big"><b>{cd.days}</b><span>{cd.days === 1 ? "day" : "days"}</span></p>
            <p className="sub">{title(WD[d.getUTCDay()])}{time ? ` · ${time}` : ""}</p>
            {cd.strip && (
              <span className="un-days" aria-hidden="true">
                {cd.strip.map((iso, i) => (
                  <span key={iso} className={`un-day${i === 0 ? " now" : i === cd.strip!.length - 1 ? " go" : ""}`}>
                    <i />
                    <small>{i === 0 ? "NOW" : WD[utc(iso).getUTCDay()].slice(0, 2)}</small>
                  </span>
                ))}
              </span>
            )}
          </div>
        ) : (
          <div>
            <p className="lbl">Today</p>
            {cd.minutes == null ? (
              <p className="big"><b>All day</b></p>
            ) : cd.minutes > 0 ? (
              <p className="big t"><b>{untilLabel(cd.minutes)}</b><span>to go</span></p>
            ) : (
              <p className="big"><b>Now</b><span>under way</span></p>
            )}
            {start && (
              <span className="un-clock">
                <ClockFace at={start} />
                <span><b>Starts {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</b></span>
              </span>
            )}
          </div>
        )}
        {cd.kind === "today" && onOpenCheckIn && (
          <div className="un-acts">
            <button type="button" className="un-btn solid" onClick={() => onOpenCheckIn(event)}>Open check-in</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ events, today, now, onAddEvent }: { events: CalendarEvent[]; today: string; now: Date; onAddEvent?: () => void }) {
  const last = lastPast(events, today, now);
  const ago = !last ? "" : last.daysAgo === 0 ? "earlier today" : last.daysAgo === 1 ? "yesterday" : `${last.daysAgo} days ago`;
  return (
    <div className="un-blank">
      <div className="un-stub" aria-hidden="true"><small>— — —</small><b>?</b><small>— — —</small></div>
      <div className="un-bd">
        <b className="un-title">{events.length ? "Nothing coming up" : "Nothing on the calendar yet"}</b>
        <p>
          {last
            ? <>The last thing was <b>{last.event.title}</b>, {ago}. {onAddEvent ? "Add the next one and it shows up here for everyone." : ""}</>
            : onAddEvent ? "Add the first event and it shows up here for everyone." : "When an officer adds an event, it shows up here."}
        </p>
        {onAddEvent && (
          <div className="un-acts">
            <button type="button" className="un-btn solid" onClick={onAddEvent}><PaperIcon name="plus" /> Add an event</button>
          </div>
        )}
      </div>
    </div>
  );
}
