"use client";

import React from "react";
import { REPEAT_MAX, repeatDates, type Repeat } from "@/lib/event-repeat";
import "./calendar-event-form.css";

/**
 * The Repeat row for a new chapter meeting: a switch first; once it's on, how
 * often (weekly / every other week) and until when (end of term, or a date).
 * The server makes one meeting per date (lib/event-repeat.ts).
 */
export interface RepeatValue { on: boolean; every: 1 | 2; toTerm: boolean; until: string }
export const REPEAT_OFF: RepeatValue = { on: false, every: 1, toTerm: true, until: "" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00`).getDay()];
/** "Oct 18", plus the year when it isn't the first meeting's year ("Dec 30, 2028"). */
const shortDate = (date: string, from?: string) => new Date(`${date}T12:00`).toLocaleDateString(undefined,
  { month: "short", day: "numeric", ...(from && from.slice(0, 4) !== date.slice(0, 4) ? { year: "numeric" } : {}) });
const meetings = (n: number) => `${n} meeting${n === 1 ? "" : "s"}`;

/** What the switch adds up to for a first meeting on `date`: the API's `repeat` and the dates it makes.
 *  The end date is used exactly as entered — never swapped for a guess — so a
 *  half-typed or too-early date reads as "not ready", and the field keeps it. */
export function resolveRepeat(value: RepeatValue, date: string, termEnd?: string) {
  const end = termEnd && date <= termEnd ? termEnd : undefined;
  const toTerm = value.toTerm && !!end;
  const until = toTerm ? end! : value.until;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(until);
  const dates = value.on && valid ? repeatDates(date, { every: value.every, until }) : [];
  const ok = !value.on || dates.length >= 2;
  const repeat: Repeat | undefined = value.on && ok ? { every: value.every, until } : undefined;
  // Before the first meeting reads as unfinished (mid-typing a year), not as a mistake.
  // The cap cut it short: the last meeting lands well before the end that was asked for.
  const capped = dates.length === REPEAT_MAX && dates[dates.length - 1] < until && repeatDates(dates[dates.length - 1], { every: value.every, until }).length > 1;
  return { repeat, dates, toTerm, until, termEnd: end, ok, capped, missing: value.on && (!valid || until < date) };
}

/** "Add meeting", or "Add 7 meetings" once it repeats. */
export const repeatSubmitLabel = (label: string, r: ReturnType<typeof resolveRepeat>) =>
  r.repeat && r.ok ? `Add ${meetings(r.dates.length)}` : label;

export function RepeatFields({ value, onChange, date, termEnd, termLabel, takenDates, icon }: {
  value: RepeatValue;
  onChange: (v: RepeatValue) => void;
  /** The first meeting's date (YYYY-MM-DD); it sets the weekday. */
  date: string;
  /** The active term's last day, for "End of term". */
  termEnd?: string;
  termLabel?: string;
  /** Dates that already have a meeting, so a repeat landing on one is called out. */
  takenDates?: ReadonlySet<string>;
  icon: React.ReactNode;
}) {
  const r = resolveRepeat(value, date, termEnd);
  const clashes = r.ok && takenDates ? r.dates.filter(d => takenDates.has(d)) : [];
  const set = (patch: Partial<RepeatValue>) => onChange({ ...value, ...patch });
  const pattern = `${value.every === 1 ? "Every" : "Every other"} ${weekdayOf(date)}`;
  return (
    <div className="cef-r">
      {icon}
      <div>
        <label className="cef-req">
          <span>
            <span className="t">Repeat</span>
            <span className="s">{value.on ? pattern : "Make this a weekly or every-other-week meeting."}</span>
          </span>
          <span className="cef-sw">
            <input type="checkbox" checked={value.on} onChange={e => set({ on: e.target.checked })} />
            <span className="track" aria-hidden />
          </span>
        </label>
        {value.on && (
          <div className="cef-rp">
            <div className="cef-seg" role="group" aria-label="How often">
              <button type="button" aria-pressed={value.every === 1} onClick={() => set({ every: 1 })}>Weekly</button>
              <button type="button" aria-pressed={value.every === 2} onClick={() => set({ every: 2 })}>Every 2 weeks</button>
            </div>
            <div className="cef-until" role="radiogroup" aria-label="Until">
              <span className="k">Until</span>
              <button type="button" role="radio" className="cef-pick" aria-checked={r.toTerm} disabled={!r.termEnd} onClick={() => set({ toTerm: true })}>
                <span className="rad" aria-hidden />End of term
                <small>{!termEnd ? "No term set" : !r.termEnd ? "Term ends first" : `${termLabel ? `${termLabel} · ` : ""}${shortDate(r.termEnd, date)}`}</small>
              </button>
              {r.toTerm ? (
                <button type="button" role="radio" className="cef-pick" aria-checked={false} onClick={() => set({ toTerm: false })}>
                  <span className="rad" aria-hidden />A date
                </button>
              ) : (
                <label className="cef-pick" role="radio" aria-checked>
                  <span className="rad" aria-hidden />
                  <input type="date" aria-label="Last meeting on or before" value={value.until} min={date} max={termEnd} onChange={e => set({ until: e.target.value })} />
                </label>
              )}
            </div>
            {r.ok ? (
              <p className="cef-rp-sum">
                <span><b>{pattern}</b> · <span className="nw">{shortDate(r.dates[0], date)} → {shortDate(r.dates[r.dates.length - 1], date)}</span></span>
                <span className="n">{meetings(r.dates.length)}</span>
              </p>
            ) : r.missing ? (
              <p className="cef-rp-sum">Pick the date of the last meeting, after {shortDate(date)}.</p>
            ) : (
              <p className="cef-rp-sum warn" role="alert">Pick an end date at least {value.every === 1 ? "a week" : "two weeks"} after {shortDate(date)}.</p>
            )}
            {r.capped && (
              <p className="cef-rp-sum warn" role="alert">
                Stops at {REPEAT_MAX} meetings ({shortDate(r.dates[r.dates.length - 1], date)}), the most one repeat adds — {r.toTerm ? `the term runs to ${shortDate(r.until, date)}. Check its end date in Settings.` : `pick an earlier end date.`}
              </p>
            )}
            {clashes.length > 0 && (
              <p className="cef-rp-sum warn" role="alert">
                {clashes.length === 1 ? `${shortDate(clashes[0], date)} already has a meeting` : `${clashes.length} of these dates already have a meeting (${clashes.slice(0, 3).map(d => shortDate(d, date)).join(", ")}${clashes.length > 3 ? "…" : ""})`}
                {" "}— you&rsquo;ll have two that day.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
