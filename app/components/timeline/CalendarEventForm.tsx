"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { scheduleDate, scheduleTime } from "@/lib/calendar-feed/schedule";
import { ScheduleFields, initialSchedule, scheduleFromValue } from "./ScheduleFields";
import type { CalendarEvent } from "../../data";
import { toDateStr } from "../../lib/dates";
import "./calendar-event-form.css";

// `collab` is programming-only (the timeline's calendar events don't carry it); it's
// optional on the draft and populated solely when the form is rendered with `showCollab`.
export type CalendarDraft = Omit<CalendarEvent, "id"> & { collab?: string };

/** A selectable category chip. `color` is optional — when absent the chip falls
 *  back to the CSS var `--c-<slug>` (used by the Programming page's built-in set). */
export interface CategoryOption {
  slug: string;
  label: string;
  color?: string;
  mandatoryDefault?: boolean;
}

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const _now = new Date();
const TODAY = { year: _now.getFullYear(), month: _now.getMonth(), day: _now.getDate() };

// Row icons stand in for labels, so the form reads top to bottom as a sentence.
const icon = (children: React.ReactNode) => (
  <svg className="cef-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const ICONS = {
  when: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  category: icon(<><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" /></>),
  required: icon(<><path d="M9 11l2.5 2.5L16 9" /><rect x="3.5" y="3.5" width="17" height="17" rx="4" /></>),
  collab: icon(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.6 2.7 2.2 3 4.4" /></>),
  location: icon(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  description: icon(<path d="M4 6h16M4 12h16M4 18h10" />),
};

export function CalendarEventForm({
  heading,
  initialEvent,
  initialCollab,
  submitLabel,
  onSubmit,
  onCancel,
  categoryOptions,
  defaultCategory,
  showCollab = false,
  minDate,
  maxDate,
}: {
  /** Small kicker above the title field; defaults to New/Edit calendar event. */
  heading?: string;
  initialEvent?: CalendarEvent;
  /** Prefill for the optional Collab field (programming events; CalendarEvent has none). */
  initialCollab?: string | null;
  submitLabel: string;
  onSubmit: (draft: CalendarDraft) => void;
  /** Renders a Cancel button beside the submit. */
  onCancel?: () => void;
  /** The selectable category chips — per-org event types, already filtered by the caller. */
  categoryOptions: CategoryOption[];
  /** Slug to preselect for a new event; defaults to the first option. */
  defaultCategory?: string;
  /** Render the optional "Collab" row (programming page). */
  showCollab?: boolean;
  /** Active-semester bounds (YYYY-MM-DD) that constrain the date picker. */
  minDate?: string;
  maxDate?: string;
}) {
  // Default a new event to today, but clamp into the semester so the prefilled
  // date isn't already out of range (string dates compare lexicographically).
  const today = toDateStr(TODAY.year, TODAY.month, TODAY.day);
  const defaultDate = minDate && today < minDate ? minDate : maxDate && today > maxDate ? maxDate : today;
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [when, setWhen] = useState(() => initialSchedule(initialEvent?.schedule, { date: initialEvent?.date ?? defaultDate, time: initialEvent?.time, isNew: !initialEvent }));
  const [scheduleError, setScheduleError] = useState("");
  const initialCategory = initialEvent?.category ?? defaultCategory ?? categoryOptions[0]?.slug ?? "";
  const [category, setCategory] = useState<string>(initialCategory);
  const [mandatory, setMandatory] = useState(
    initialEvent?.mandatory ?? categoryOptions.find(o => o.slug === initialCategory)?.mandatoryDefault ?? false,
  );
  const [collab, setCollab] = useState(initialCollab ?? "");
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // The notes field grows with its content (capped in CSS) instead of scrolling a sliver.
  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [description]);

  // Picking a type that defaults to required (e.g. Chapter) auto-checks the box;
  // picking a non-required type never *unchecks* a box the user set on purpose.
  function selectCategory(option: CategoryOption) {
    setCategory(option.slug);
    if (option.mandatoryDefault) setMandatory(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const result = scheduleFromValue(when);
    if ("error" in result) { setScheduleError(result.error); return; }
    setScheduleError("");
    const { schedule } = result;
    onSubmit({
      schedule,
      title: title.trim(),
      date: schedule ? scheduleDate(schedule) : when.date,
      time: schedule ? scheduleTime(schedule) ?? undefined : optionalValue(when.legacyTime),
      category,
      mandatory,
      location: optionalValue(location),
      description: optionalValue(description),
      ...(showCollab ? { collab: collab.trim() } : {}),
    });
  }

  const selected = categoryOptions.find(o => o.slug === category);
  const categoryHint = category === "party" ? "Guest list and wrap-up live on the Parties page."
    : selected?.mandatoryDefault ? `${selected.label} events are required by default.`
    : "";

  // The Modal mounts outside the page's `.dash` wrapper. `.cef-root` carries just
  // the dusk theme *tokens* (no page-wrapper layout) so the form sits flush in the
  // Modal body — see calendar-event-form.css. Callers open the Modal with
  // `hideHeader`: this form owns the kicker, and the Modal's floating ✕ lines up with it.
  return (
    <div className="cef-root">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="cef cef-sheet"
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); formRef.current?.requestSubmit(); } }}
      >
        <div className="cef-head"><span className="cef-kicker">{heading ?? (initialEvent ? "Edit calendar event" : "New calendar event")}</span></div>

        <label className="sr-only" htmlFor="event-title">Title</label>
        <input
          id="event-title"
          className="cef-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Event name"
          autoComplete="off"
          autoFocus
          required
        />

        <div className="cef-rows">
          {/* When — a real start/end is what subscribed calendars can show */}
          <div className="cef-r">
            {ICONS.when}
            <div>
              <ScheduleFields variant="inline" value={when} onChange={setWhen} minDate={minDate} maxDate={maxDate} />
              {scheduleError && <p role="alert" className="cef-hint sched-warn cef-r-note">{scheduleError}</p>}
            </div>
          </div>

          {/* Category — color-coded chips matching the timeline node dots */}
          <div className="cef-r">
            {ICONS.category}
            <div>
              <div className="cef-cats" role="radiogroup" aria-label="Category">
                {categoryOptions.map(option => (
                  <button
                    key={option.slug}
                    type="button"
                    role="radio"
                    aria-checked={category === option.slug}
                    onClick={() => selectCategory(option)}
                    className="cef-cat"
                    style={{ ["--cdot" as string]: option.color ?? `var(--c-${option.slug})` }}
                  >
                    <span className="dot" />
                    {option.label}
                  </button>
                ))}
              </div>
              {categoryHint && <p className="cef-hint cef-r-note">{categoryHint}</p>}
            </div>
          </div>

          {/* Required attendance */}
          <div className="cef-r">
            {ICONS.required}
            <label className="cef-req">
              <span>
                <span className="t">Required attendance</span>
                <span className="s">Take attendance and track excuses.</span>
              </span>
              <span className="cef-sw">
                <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)} />
                <span className="track" aria-hidden />
              </span>
            </label>
          </div>

          {showCollab && (
            <div className="cef-r">
              {ICONS.collab}
              <div>
                <label className="sr-only" htmlFor="event-collab">Collab</label>
                <input id="event-collab" className="cef-quiet" value={collab} onChange={e => setCollab(e.target.value)} placeholder="Add a collab org (KDF, DSP…)" />
              </div>
            </div>
          )}

          <div className="cef-r">
            {ICONS.location}
            <div>
              <label className="sr-only" htmlFor="event-location">Location</label>
              <input id="event-location" className="cef-quiet" value={location} onChange={e => setLocation(e.target.value)} placeholder="Add location" />
            </div>
          </div>

          <div className="cef-r">
            {ICONS.description}
            <div>
              <label className="sr-only" htmlFor="event-description">Description</label>
              <textarea ref={descRef} id="event-description" className="cef-quiet cef-notes" rows={1} value={description} onChange={e => setDescription(e.target.value)} placeholder="Add notes, agenda, or links" />
            </div>
          </div>
        </div>

        <div className="cef-foot">
          <span className="cef-kbd"><kbd>⌘</kbd> <kbd>↵</kbd> to {initialEvent ? "save" : "add"}</span>
          <div className="cef-btns">
            {onCancel && <button type="button" className="cef-btn ghost" onClick={onCancel}>Cancel</button>}
            <button type="submit" className="cef-btn primary" disabled={!title.trim()}>{submitLabel}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
