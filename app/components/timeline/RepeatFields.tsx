"use client";

import React from "react";
import { repeatDates, type Repeat } from "@/lib/event-repeat";
import { toDateStr } from "../../lib/dates";
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
const shortDate = (date: string) => new Date(`${date}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const addWeeks = (date: string, weeks: number) => { const d = new Date(`${date}T12:00`); d.setDate(d.getDate() + weeks * 7); return toDateStr(d.getFullYear(), d.getMonth(), d.getDate()); };
const meetings = (n: number) => `${n} meeting${n === 1 ? "" : "s"}`;

/** What the switch adds up to for a first meeting on `date`: the API's `repeat` and the dates it makes. */
export function resolveRepeat(value: RepeatValue, date: string, termEnd?: string) {
  const end = termEnd && date <= termEnd ? termEnd : undefined;
  const toTerm = value.toTerm && !!end;
  const until = toTerm ? end! : (value.until && value.until >= date ? value.until : addWeeks(date, 6));
  const repeat: Repeat | undefined = value.on ? { every: value.every, until } : undefined;
  const dates = repeat ? repeatDates(date, repeat) : [];
  return { repeat, dates, toTerm, until, termEnd: end, ok: !repeat || dates.length >= 2 };
}

/** "Add meeting", or "Add 7 meetings" once it repeats. */
export const repeatSubmitLabel = (label: string, r: ReturnType<typeof resolveRepeat>) =>
  r.repeat && r.ok ? `Add ${meetings(r.dates.length)}` : label;

export function RepeatFields({ value, onChange, date, termEnd, termLabel, icon }: {
  value: RepeatValue;
  onChange: (v: RepeatValue) => void;
  /** The first meeting's date (YYYY-MM-DD); it sets the weekday. */
  date: string;
  /** The active term's last day, for "End of term". */
  termEnd?: string;
  termLabel?: string;
  icon: React.ReactNode;
}) {
  const r = resolveRepeat(value, date, termEnd);
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
                <small>{!termEnd ? "No term set" : !r.termEnd ? "Term ends first" : `${termLabel ? `${termLabel} · ` : ""}${shortDate(r.termEnd)}`}</small>
              </button>
              {r.toTerm ? (
                <button type="button" role="radio" className="cef-pick" aria-checked={false} onClick={() => set({ toTerm: false, until: value.until || r.until })}>
                  <span className="rad" aria-hidden />A date
                </button>
              ) : (
                <label className="cef-pick" role="radio" aria-checked>
                  <span className="rad" aria-hidden />
                  <input type="date" aria-label="Last meeting on or before" value={r.until} min={date} max={termEnd} onChange={e => set({ until: e.target.value })} />
                </label>
              )}
            </div>
            {r.ok ? (
              <p className="cef-rp-sum">
                <span><b>{pattern}</b> · <span className="nw">{shortDate(r.dates[0])} → {shortDate(r.dates[r.dates.length - 1])}</span></span>
                <span className="n">{meetings(r.dates.length)}</span>
              </p>
            ) : (
              <p className="cef-rp-sum warn" role="alert">Pick an end date at least {value.every === 1 ? "a week" : "two weeks"} after {shortDate(date)}.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
