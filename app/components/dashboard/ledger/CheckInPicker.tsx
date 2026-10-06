import React, { useState } from "react";
import type { CalendarEvent } from "../../../data";
import { formatEventTime } from "@/lib/event-time";
import { PaperIcon } from "../../paper/PaperIcon";

// No "use client" directive: ledger/* components inherit client-ness from
// app/[slug]/page.tsx, which is itself "use client".

/**
 * "Open check-in for…" in the paper look — the mock's ci-pick sheet
 * (_design/Dashboard Paper Mock.html). Required events in three shelves:
 * Today, Coming up, Earlier (corrections), each a radio card with a date
 * block. Tonight's event is preselected, so the common case is still one
 * press of "Open check-in"; the sheet exists so an officer always sees which
 * event the hour is about to start on.
 *
 * `candidates` arrives already ordered (checkInCandidates in the page: today,
 * then upcoming by proximity, then past by recency).
 */
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d, w: new Date(y, m - 1, d).getDay() }; };
const fmtD = (iso: string) => { const p = parts(iso); return `${MON[p.m - 1]} ${p.d}`; };
const daysFrom = (iso: string, today: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
function relWhen(n: number): string {
  if (n === 1) return "Tomorrow";
  if (n < 7) return `In ${n} days`;
  if (n < 14) return "Next week";
  return `In ${Math.round(n / 7)} weeks`;
}

export function CheckInPicker({
  candidates, todayISO, live, onOpen, onCancel,
}: {
  candidates: CalendarEvent[];
  todayISO: string;
  /** The window currently accepting check-ins, if any — opening another closes it first. */
  live: { title: string; date: string; presentCount: number } | null;
  onOpen: (event: CalendarEvent) => void;
  onCancel: () => void;
}) {
  const today = candidates.filter(e => e.date === todayISO);
  const up    = candidates.filter(e => e.date > todayISO);
  const past  = candidates.filter(e => e.date < todayISO);
  // Tonight is preselected; anything else is a deliberate pick, so a stray
  // Enter can't start the hour on a past (correction) event.
  const [sel, setSel]   = useState<number | null>(today[0]?.id ?? null);
  const [more, setMore] = useState<"up" | "past" | null>(null);
  const picked = candidates.find(e => e.id === sel) ?? null;
  const pickedDays = picked ? daysFrom(picked.date, todayISO) : 0;

  const row = (e: CalendarEvent) => {
    const n = daysFrom(e.date, todayISO);
    const p = parts(e.date);
    const time = formatEventTime(e.time, e.schedule);
    return (
      <label key={e.id} className={`ci-ev${n === 0 ? " today" : ""}`}>
        <input type="radio" name="ci-ev" value={e.id} checked={sel === e.id} onChange={() => setSel(e.id)} />
        <span className="d"><small>{DOW[p.w]}</small><b>{p.d}</b></span>
        <span className="mid">
          <span className="t">{e.title}</span>
          <span className="m">{fmtD(e.date)}{time ? ` · ${time}` : ""}{e.location ? ` · ${e.location}` : ""}</span>
        </span>
        <span className="st">
          <span className="w">{n === 0 ? <b>{time || "Today"}</b> : n > 0 ? relWhen(n) : "correction"}</span>
          <span className="rd" aria-hidden="true" />
        </span>
      </label>
    );
  };

  const shelf = (key: "today" | "up" | "past", label: string, sub: string, list: CalendarEvent[], cap: number) => {
    if (list.length === 0) return null;
    const shown = more === key ? list : list.slice(0, cap);
    return (
      <div>
        <p className="sh">{label}{sub && <small>{sub}</small>}</p>
        <div className="ls">
          {shown.map(row)}
          {list.length > shown.length && (
            <button type="button" className="ci-more" onClick={() => setMore(key as "up" | "past")}>Show {list.length - shown.length} more</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <form
      className="ci-pick"
      onSubmit={ev => { ev.preventDefault(); if (picked) onOpen(picked); }}
    >
      {live && (
        <p className="ci-live">
          <PaperIcon name="clock" />
          <span>
            Check-in is open for <b>{live.title}</b> ({fmtD(live.date)}, {live.presentCount} here).
            Opening another closes it and records its attendance first.
          </span>
        </p>
      )}
      <div className="ci-pk">
        {candidates.length === 0
          ? <p className="ci-none">No required events yet. Mark an event as required and it shows up here.</p>
          : <>
              {today.length === 0 && <p className="ci-none">Nothing required on today — pick another event.</p>}
              {shelf("today", "Today", "", today, 9)}
              {shelf("up", "Coming up", "", up, 3)}
              {shelf("past", "Earlier", "corrections", past, 3)}
            </>}
      </div>
      <p className="ci-warn" aria-live="polite">
        {picked && pickedDays > 0 && `That’s ${relWhen(pickedDays).toLowerCase()}. The hour starts now, not on the day.`}
        {picked && pickedDays < 0 && `A correction: whoever checks in is recorded against ${fmtD(picked.date)} when the window closes.`}
      </p>
      <div className="ci-pick-f">
        <span className="note">Required events only. The window stays open for an hour.</span>
        <button type="button" className="ci-pick-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="ci-pick-go" disabled={!picked}>
          <PaperIcon name="check" />Open check-in
        </button>
      </div>
    </form>
  );
}
