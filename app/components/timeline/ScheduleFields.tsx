"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { nextDate, parseLegacyTime, resolveWallTime, scheduleSchema, timeIsClear, validDate, validZone, type Schedule, type WallTime } from "@/lib/calendar-feed/schedule";
export { parseLegacyTime };
import { requestJson } from "../../lib/api";
import { clock12 } from "@/lib/event-time";
import "./calendar-event-form.css";

/**
 * The one start/end editor shared by every event form (timeline, programming,
 * parties, service). Subscribed calendars can only show a time that was entered
 * here: a free-text "7ish" publishes as an all-day block.
 */
export type ScheduleMode = "timed" | "allDay" | "legacy";
export interface ScheduleValue {
  mode: ScheduleMode;
  date: string;
  startTime: string;   // HH:MM local to `zone`
  endTime: string;     // HH:MM, optional; at or before start means it ends the next day
  lastDay: string;     // all-day: inclusive last day, "" for a single day
  legacyTime: string;  // free text kept as written
  zone: string;
  startOffset: string; // only set when a repeated DST hour needs choosing
  endOffset: string;
}

const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } };
const toLocal = (instant: string, zone: string) => Temporal.Instant.from(instant).toZonedDateTimeISO(zone);

/** New events start timed; an existing event without saved times opens as the
 *  all-day entry it already is, so unrelated edits aren't blocked on times. */
export function initialSchedule(saved: Schedule | null | undefined, fallback: { date: string; time?: string | null; isNew: boolean }): ScheduleValue {
  const base: ScheduleValue = { mode: "timed", date: fallback.date, startTime: "", endTime: "", lastDay: "", legacyTime: "", zone: "", startOffset: "", endOffset: "" };
  const parsed = scheduleSchema.safeParse(saved);
  if (parsed.success && parsed.data.kind === "timed") {
    const { start, end, timeZone } = parsed.data;
    const s = toLocal(start, timeZone), e = end ? toLocal(end, timeZone) : null;
    return { ...base, date: s.toPlainDate().toString(), startTime: s.toPlainTime().toString({ smallestUnit: "minute" }), endTime: e?.toPlainTime().toString({ smallestUnit: "minute" }) ?? "", zone: timeZone, startOffset: s.offset, endOffset: e?.offset ?? "" };
  }
  if (parsed.success && parsed.data.kind === "allDay") {
    const { start, end } = parsed.data;
    const last = Temporal.PlainDate.from(end).subtract({ days: 1 }).toString();
    return { ...base, mode: "allDay", date: start, lastDay: last === start ? "" : last };
  }
  // An existing event with only a free-text time: keep it until someone sets real times.
  if (fallback.time?.trim()) return { ...base, mode: "legacy", legacyTime: fallback.time.trim() };
  return fallback.isNew ? base : { ...base, mode: "allDay" };
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Minutes from start to end; an end at or before the start is on the next day. */
function lengthMinutes(startTime: string, endTime: string): number {
  return (mins(endTime) - mins(startTime) + 1440) % 1440 || 1440;
}

/** An overnight span over 12 hours is almost always an AM/PM slip (7pm–9am
 *  meant 7–9pm). `suggest` is the other-meridiem end when that lands later the
 *  same day. Null when the pair looks deliberate. */
export function suspectLength(startTime: string, endTime: string): { hours: number; suggest: string | null } | null {
  if (!startTime || !endTime || endTime > startTime) return null; // same-day spans are fine
  const length = lengthMinutes(startTime, endTime);
  if (length <= 12 * 60 || length === 1440) return null;
  const flipped = hhmm((mins(endTime) + 720) % 1440);
  return { hours: Math.round(length / 60), suggest: flipped > startTime ? flipped : null };
}

/** "2 hr", "1 hr 30 min", "45 min": the length of a start/end pair, overnight included. */
export function durationLabel(startTime: string, endTime: string): string {
  const total = lengthMinutes(startTime, endTime);
  const h = Math.floor(total / 60), m = total % 60;
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(" ");
}

export type ScheduleResult = { schedule: Schedule | null } | { error: string };

function endDateFor(v: ScheduleValue) { return v.endTime <= v.startTime ? nextDate(v.date) : v.date; }
function wall(v: ScheduleValue, which: "start" | "end"): WallTime | null {
  const time = which === "start" ? v.startTime : v.endTime;
  if (!validDate(v.date) || !/^\d{2}:\d{2}$/.test(time) || !validZone(v.zone)) return null;
  const day = which === "start" ? v.date : endDateFor(v);
  return resolveWallTime(`${day}T${time}`, v.zone, (which === "start" ? v.startOffset : v.endOffset) || undefined);
}

export function scheduleFromValue(v: ScheduleValue): ScheduleResult {
  if (!validDate(v.date)) return { error: "Choose a date." };
  if (v.mode === "legacy") return { schedule: null };
  if (v.mode === "allDay") {
    if (v.lastDay && (!validDate(v.lastDay) || v.lastDay < v.date)) return { error: "The last day can't be before the first." };
    return { schedule: { kind: "allDay", start: v.date, end: nextDate(v.lastDay || v.date) } };
  }
  if (!v.startTime) return { error: "Add a start time, or make it an all-day event." };
  if (!validZone(v.zone)) return { error: "Choose a time zone for this event." };
  if (v.endTime && v.endTime === v.startTime) return { error: "The end time is the same as the start. Clear it or pick a later time." };
  const instants: { start?: string; end?: string } = {};
  // The end is optional; a blank one publishes with the default length.
  for (const label of v.endTime ? ["start", "end"] as const : ["start"] as const) {
    const w = wall(v, label);
    if (!w) return { error: `Check the ${label} time.` };
    if (w.kind === "gap") return { error: `That ${label} time doesn't exist on this date. Clocks skip forward an hour for daylight saving.` };
    if (w.kind === "ambiguous") return { error: `That ${label} time happens twice on this date. Choose which one below.` };
    instants[label] = w.instant;
  }
  const parsed = scheduleSchema.safeParse({ kind: "timed", ...instants, timeZone: v.zone });
  return parsed.success ? { schedule: parsed.data } : { error: "The end must be after the start." };
}

// One fetch per page load; every form on the page shares it.
let orgZoneRequest: Promise<string | null> | null = null;
function useOrgTimeZone(): { zone: string | null; loaded: boolean } {
  const [state, setState] = useState<{ zone: string | null; loaded: boolean }>({ zone: null, loaded: false });
  useEffect(() => {
    let live = true;
    orgZoneRequest ??= requestJson<{ timeZone: string | null }>("/api/calendar/subscription").then(v => v.timeZone ?? null, () => { orgZoneRequest = null; return null; });
    void orgZoneRequest.then(zone => { if (live) setState({ zone, loaded: true }); });
    return () => { live = false; };
  }, []);
  return state;
}

function zoneLabel(zone: string): string {
  const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  try {
    const abbr = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value;
    return abbr ? `${city} (${abbr})` : city;
  } catch { return city; }
}
function allZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try { return intl.supportedValuesOf?.("timeZone") ?? []; } catch { return []; }
}

export function ScheduleFields({ value, onChange, minDate, maxDate, legacyReadOnly = false, variant = "stacked" }: {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
  minDate?: string;
  maxDate?: string;
  /** Forms whose API can't store free-text times show the legacy value without editing it. */
  legacyReadOnly?: boolean;
  /** "inline" is the calendar-event dialog's one-line `date  start → end` row with
   *  an All day switch; "stacked" is the labelled grid the other forms use. */
  variant?: "stacked" | "inline";
}) {
  const id = useId();
  const org = useOrgTimeZone();
  const [pickingZone, setPickingZone] = useState(false);
  const [zoneDraft, setZoneDraft] = useState("");
  const [showLastDay, setShowLastDay] = useState(false);
  const zones = useMemo(allZones, []);
  const set = (patch: Partial<ScheduleValue>) => onChange({ ...value, ...patch });
  const defaultZone = org.zone ?? deviceZone();

  // A new or legacy event takes the organization's zone once it is known.
  useEffect(() => {
    if (!value.zone && org.loaded && defaultZone) onChange({ ...value, zone: defaultZone });
  }, [org.loaded, defaultZone, value, onChange]);

  const timed = value.mode === "timed";
  // Ends only appears once there is a start; a hidden end is ignored. It stays
  // up while the start is being retyped (a half-typed time reads as ""), so the
  // field doesn't vanish and jump back mid-edit.
  const showEnd = timed && Boolean(value.startTime || value.endTime);
  const hasEnd = timed && Boolean(value.startTime && value.endTime);
  const start = timed ? wall(value, "start") : null;
  const end = hasEnd ? wall(value, "end") : null;
  // Classify without the chosen offset so the chooser stays visible (and shows
  // the choice) once someone has picked one.
  const startRepeat = timed ? wall({ ...value, startOffset: "" }, "start") : null;
  const endRepeat = hasEnd ? wall({ ...value, endOffset: "" }, "end") : null;
  const overnight = hasEnd && value.endTime <= value.startTime;
  const sameAsStart = hasEnd && value.endTime === value.startTime;
  const suspect = hasEnd ? suspectLength(value.startTime, value.endTime) : null;
  // "EDT" vs "EST" for the two readings of a repeated hour.
  const offsetName = (which: "start" | "end", offset: string) => {
    try {
      const day = which === "start" ? value.date : endDateFor(value);
      const time = which === "start" ? value.startTime : value.endTime;
      const at = Temporal.ZonedDateTime.from(`${day}T${time}${offset}[${value.zone}]`, { offset: "reject" }).epochMilliseconds;
      return new Intl.DateTimeFormat("en-US", { timeZone: value.zone, timeZoneName: "short" }).formatToParts(at).find(p => p.type === "timeZoneName")?.value;
    } catch { return undefined; }
  };

  const legacyRead = value.mode === "legacy" ? parseLegacyTime(value.legacyTime).start : undefined;
  function convertLegacy() {
    const guess = parseLegacyTime(value.legacyTime);
    set({ mode: "timed", startTime: guess.start ?? "", endTime: guess.end ?? "" });
  }

  const repeatChooser = (which: "start" | "end", w: WallTime | null) => w?.kind === "ambiguous" && (
    <fieldset className="sched-repeat">
      <legend className="cef-hint">This {which} time happens twice on {value.date} (clocks fall back). Which one?</legend>
      {w.offsets.map((offset, i) => (
        <label key={offset} className="sched-radio">
          <input type="radio" name={`${id}-${which}-offset`} checked={(which === "start" ? value.startOffset : value.endOffset) === offset}
            onChange={() => set(which === "start" ? { startOffset: offset } : { endOffset: offset })} />
          {i === 0 ? "The first time" : "The second time"} ({offsetName(which, offset) ?? offset})
        </label>
      ))}
    </fieldset>
  );

  const zonePicker = (
    <div className="cef-field">
      <label className="cef-label" htmlFor={`${id}-zone`}>Time zone for this event</label>
      <input id={`${id}-zone`} className="cef-input" list={`${id}-zones`} value={zoneDraft} autoFocus placeholder="Search a city, e.g. Chicago"
        onChange={e => setZoneDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setPickingZone(false); } }} />
      <datalist id={`${id}-zones`}>{zones.map(z => <option key={z} value={z}>{zoneLabel(z)}</option>)}</datalist>
      <div className="sched-zone-actions">
        <button type="button" className="sched-link" disabled={!validZone(zoneDraft)}
          onClick={() => { set({ zone: zoneDraft, startOffset: "", endOffset: "" }); setPickingZone(false); }}>Use this zone</button>
        {org.zone && value.zone !== org.zone && (
          <button type="button" className="sched-link" onClick={() => { set({ zone: org.zone!, startOffset: "", endOffset: "" }); setPickingZone(false); }}>Use the organization&apos;s ({zoneLabel(org.zone)})</button>
        )}
        <button type="button" className="sched-link" onClick={() => setPickingZone(false)}>Cancel</button>
      </div>
    </div>
  );

  // Problems a timed span can have, shared by both layouts.
  const timedWarnings = <>
    {sameAsStart && <p className="cef-hint sched-warn" role="alert">The end is the same as the start. Clear it or pick a later time.</p>}
    {suspect && (
      <p className="cef-hint sched-warn" role="alert">
        This runs {suspect.hours} hours, ending the next day at {clock12(value.endTime)}.{" "}
        {suspect.suggest && <button type="button" className="sched-link" onClick={() => set({ endTime: suspect.suggest!, endOffset: "" })}>Change to {clock12(suspect.suggest)}</button>}
      </p>
    )}
    {start?.kind === "gap" && <p className="cef-hint sched-warn" role="alert">That start time doesn&apos;t exist on this date (clocks skip forward an hour).</p>}
    {end?.kind === "gap" && <p className="cef-hint sched-warn" role="alert">That end time doesn&apos;t exist on this date (clocks skip forward an hour).</p>}
    {repeatChooser("start", startRepeat)}
    {repeatChooser("end", endRepeat)}
  </>;

  if (variant === "inline") {
    const allDay = value.mode === "allDay";
    const multiDay = allDay && (showLastDay || Boolean(value.lastDay));
    const startClock = clock12(value.startTime);
    return (
      <div className="sched sched-inline">
        <div className="sched-when">
          <label className="sr-only" htmlFor={`${id}-date`}>{multiDay ? "First day" : "Date"}</label>
          <input id={`${id}-date`} type="date" className="cef-input sched-date" value={value.date} min={minDate} max={maxDate} required
            onChange={e => set({ date: e.target.value, startOffset: "", endOffset: "" })} />
          {value.mode === "timed" && <>
            <label className="sr-only" htmlFor={`${id}-start`}>Starts</label>
            <input id={`${id}-start`} type="time" className="cef-input sched-time" value={value.startTime} required
              onChange={e => set({ startTime: e.target.value, startOffset: "" })} />
            <span className="sched-arrow" aria-hidden>→</span>
            <label className="sr-only" htmlFor={`${id}-end`}>Ends (optional)</label>
            <input id={`${id}-end`} type="time" className="cef-input sched-time" value={value.endTime}
              onChange={e => set({ endTime: e.target.value, endOffset: "" })} />
          </>}
          {multiDay && <>
            <span className="sched-arrow" aria-hidden>→</span>
            <label className="sr-only" htmlFor={`${id}-last`}>Last day (optional)</label>
            <input id={`${id}-last`} type="date" className="cef-input sched-date" value={value.lastDay} min={value.date} max={maxDate}
              onChange={e => set({ lastDay: e.target.value })} />
          </>}
          {value.mode === "legacy" && <>
            <label className="sr-only" htmlFor={`${id}-legacy`}>Time, as written</label>
            <input id={`${id}-legacy`} className="cef-input sched-legacy" value={value.legacyTime} readOnly={legacyReadOnly} onChange={e => set({ legacyTime: e.target.value })} />
          </>}
        </div>

        <div className="sched-meta">
          <span className="sched-dur" aria-live="polite">
            {value.mode === "timed" && (
              !value.startTime ? "Pick a start time"
                : !value.endTime ? <>Starts <b>{startClock}</b> · no end time</>
                : sameAsStart ? "End matches start"
                : <><b>{durationLabel(value.startTime, value.endTime)}</b>{overnight && " · ends next day"}</>
            )}
            {allDay && <><b>All day</b>{!multiDay && <> · <button type="button" className="sched-link" onClick={() => setShowLastDay(true)}>Several days</button></>}</>}
            {value.mode === "legacy" && <b>As written</b>}
            {value.mode === "timed" && !pickingZone && <>
              {" · "}
              <button type="button" className="sched-zone" title="Change time zone" onClick={() => { setZoneDraft(""); setPickingZone(true); }}>
                {value.zone ? zoneLabel(value.zone) : "Loading time zone…"}
              </button>
            </>}
          </span>
          <label className="cef-sw">
            <input type="checkbox" checked={allDay} onChange={e => e.target.checked ? set({ mode: "allDay" }) : value.mode === "allDay" && set({ mode: "timed" })} />
            <span className="track" aria-hidden />All day
          </label>
        </div>

        {value.mode === "legacy" && (
          <p className="cef-hint">
            {legacyRead
              ? <>Calendars show this at {clock12(legacyRead)}{timeIsClear(value.legacyTime) ? "" : " (no AM/PM was typed, so it's read as PM)"}.{" "}</>
              : <>Calendar subscriptions show this as an all-day event until it has a start time.{" "}</>}
            <button type="button" className="sched-link" onClick={convertLegacy}>Set a time</button>
          </p>
        )}
        {value.mode === "timed" && <>
          {timedWarnings}
          {pickingZone && zonePicker}
        </>}
      </div>
    );
  }

  return (
    <div className="sched">
      <div className="cef-chips" role="radiogroup" aria-label="Schedule">
        {value.mode === "legacy" && (
          <button type="button" role="radio" aria-checked className="cef-chip on" style={{ ["--cdot" as string]: "var(--muted)" }}>As written</button>
        )}
        {(["timed", "allDay"] as const).map(mode => (
          <button key={mode} type="button" role="radio" aria-checked={value.mode === mode}
            className={`cef-chip${value.mode === mode ? " on" : ""}`} style={{ ["--cdot" as string]: "var(--vio)" }}
            onClick={() => mode === "timed" && value.mode === "legacy" ? convertLegacy() : set({ mode })}>
            {mode === "timed" ? "Set a time" : "All day"}
          </button>
        ))}
      </div>

      <div className={`sched-row ${value.mode}`}>
        <div className="cef-field">
          <label className="cef-label" htmlFor={`${id}-date`}>{value.mode === "allDay" && value.lastDay ? "First day" : "Date"}</label>
          <input id={`${id}-date`} type="date" className="cef-input" value={value.date} min={minDate} max={maxDate} required
            onChange={e => set({ date: e.target.value, startOffset: "", endOffset: "" })} />
        </div>
        {value.mode === "timed" && <>
          <div className="cef-field">
            <label className="cef-label" htmlFor={`${id}-start`}>Starts</label>
            <input id={`${id}-start`} type="time" className="cef-input" value={value.startTime} required
              onChange={e => set({ startTime: e.target.value, startOffset: "" })} />
          </div>
          {showEnd && <div className="cef-field sched-end-in">
            <label className="cef-label" htmlFor={`${id}-end`}>Ends<span className="opt">opt</span></label>
            <input id={`${id}-end`} type="time" className="cef-input" value={value.endTime} onChange={e => set({ endTime: e.target.value, endOffset: "" })} />
          </div>}
        </>}
        {value.mode === "allDay" && (
          <div className="cef-field">
            <label className="cef-label" htmlFor={`${id}-last`}>Last day<span className="opt">opt</span></label>
            <input id={`${id}-last`} type="date" className="cef-input" value={value.lastDay} min={value.date} max={maxDate} onChange={e => set({ lastDay: e.target.value })} />
          </div>
        )}
        {value.mode === "legacy" && (
          <div className="cef-field">
            <label className="cef-label" htmlFor={`${id}-legacy`}>Time<span className="opt">as written</span></label>
            <input id={`${id}-legacy`} className="cef-input" value={value.legacyTime} readOnly={legacyReadOnly} onChange={e => set({ legacyTime: e.target.value })} />
          </div>
        )}
      </div>

      {value.mode === "legacy" && (
        <p className="cef-hint">
          {legacyRead
            ? <>Calendars show this at {clock12(legacyRead)}{timeIsClear(value.legacyTime) ? "" : " (no AM/PM was typed, so it's read as PM)"}.{" "}</>
            : <>Calendar subscriptions show this as an all-day event until it has a start time.{" "}</>}
          <button type="button" className="sched-link" onClick={convertLegacy}>Set a time</button>
        </p>
      )}

      {value.mode === "timed" && <>
        {hasEnd && !sameAsStart && !suspect && <p className="cef-hint sched-duration">{durationLabel(value.startTime, value.endTime)}{overnight && " · ends the next day"}</p>}
        {timedWarnings}
        {!pickingZone ? (
          <p className="cef-hint">
            {value.zone ? <>Times in {zoneLabel(value.zone)}{!org.zone && value.zone === deviceZone() ? " · this device's zone" : ""}. </> : "Loading time zone… "}
            <button type="button" className="sched-link" onClick={() => { setZoneDraft(""); setPickingZone(true); }}>Change</button>
          </p>
        ) : zonePicker}
      </>}
    </div>
  );
}
