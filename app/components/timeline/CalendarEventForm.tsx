"use client";

import React, { useState } from "react";
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

export function CalendarEventForm({
  initialEvent,
  initialCollab,
  submitLabel,
  onSubmit,
  categoryOptions,
  defaultCategory,
  showCollab = false,
  minDate,
  maxDate,
}: {
  initialEvent?: CalendarEvent;
  /** Prefill for the optional Collab field (programming events; CalendarEvent has none). */
  initialCollab?: string | null;
  submitLabel: string;
  onSubmit: (draft: CalendarDraft) => void;
  /** The selectable category chips — per-org event types, already filtered by the caller. */
  categoryOptions: CategoryOption[];
  /** Slug to preselect for a new event; defaults to the first option. */
  defaultCategory?: string;
  /** Render the optional "Collab" field in the details block (programming page). */
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
  const [date, setDate] = useState(initialEvent?.date ?? defaultDate);
  const [time, setTime] = useState(initialEvent?.time ?? "");
  const initialCategory = initialEvent?.category ?? defaultCategory ?? categoryOptions[0]?.slug ?? "";
  const [category, setCategory] = useState<string>(initialCategory);
  const [mandatory, setMandatory] = useState(
    initialEvent?.mandatory ?? categoryOptions.find(o => o.slug === initialCategory)?.mandatoryDefault ?? false,
  );
  const [collab, setCollab] = useState(initialCollab ?? "");
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");

  // Picking a type that defaults to required (e.g. Chapter) auto-checks the box;
  // picking a non-required type never *unchecks* a box the user set on purpose.
  function selectCategory(option: CategoryOption) {
    setCategory(option.slug);
    if (option.mandatoryDefault) setMandatory(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      title: title.trim(),
      date,
      time: optionalValue(time),
      category,
      mandatory,
      location: optionalValue(location),
      description: optionalValue(description),
      ...(showCollab ? { collab: collab.trim() } : {}),
    });
  }

  // The Modal mounts outside the page's `.dash` wrapper. `.cef-root` carries just
  // the dusk theme *tokens* (no page-wrapper layout) so the form sits flush in the
  // Modal body — see calendar-event-form.css.
  return (
    <div className="cef-root">
      <form onSubmit={handleSubmit} className="cef">
        {/* Title — the one thing every event needs */}
        <div className="cef-field">
          <label className="cef-label" htmlFor="event-title">Title</label>
          <input
            id="event-title"
            className="cef-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Chapter meeting…"
            autoFocus
            required
          />
        </div>

        {/* When — date grows, optional time sits beside it */}
        <div className="cef-when">
          <div className="cef-field">
            <label className="cef-label" htmlFor="event-date">Date</label>
            <input id="event-date" type="date" className="cef-input" value={date} onChange={e => setDate(e.target.value)} min={minDate} max={maxDate} required />
          </div>
          <div className="cef-field">
            <label className="cef-label" htmlFor="event-time">Time<span className="opt">opt</span></label>
            <input id="event-time" className="cef-input" value={time} onChange={e => setTime(e.target.value)} placeholder="7:00 PM" />
          </div>
        </div>

        {/* Category — color-coded chips matching the timeline node dots */}
        <div className="cef-field">
          <span className="cef-label">Category</span>
          <div className="cef-chips" role="radiogroup" aria-label="Category">
            {categoryOptions.map(option => {
              const selected = category === option.slug;
              return (
                <button
                  key={option.slug}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectCategory(option)}
                  className={`cef-chip${selected ? " on" : ""}`}
                  style={{ ["--cdot" as string]: option.color ?? `var(--c-${option.slug})` }}
                >
                  <span className="dot" />
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="cef-hint">Deadlines and parties are managed from their dashboard lists.</p>
        </div>

        {/* Required attendance */}
        <label className={`cef-toggle${mandatory ? " on" : ""}`}>
          <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)} />
          <span>
            <span className="ttl">Required attendance</span>
            <span className="sub">Track who shows up and who's excused.</span>
          </span>
        </label>

        {/* Optional details — folded below a divider so the essentials read first */}
        <div className="cef-details">
          <span className="cef-details-lbl">Details · optional</span>
          {showCollab && (
            <div className="cef-field">
              <label className="cef-label" htmlFor="event-collab">Collab<span className="opt">opt</span></label>
              <input id="event-collab" className="cef-input" value={collab} onChange={e => setCollab(e.target.value)} placeholder="KDF, DSP…" />
            </div>
          )}
          <div className="cef-field">
            <label className="cef-label" htmlFor="event-location">Location</label>
            <input id="event-location" className="cef-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Chapter Room" />
          </div>
          <div className="cef-field">
            <label className="cef-label" htmlFor="event-description">Description</label>
            <textarea id="event-description" className="cef-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes, agenda, links…" />
          </div>
        </div>

        <button type="submit" className="cef-submit">{submitLabel}</button>
      </form>
    </div>
  );
}
