"use client";

import React, { useState } from "react";
import type { CalendarEvent, CalEventCategory } from "../../data";
import { toDateStr } from "../../lib/dates";
import "./calendar-event-form.css";

export type CalendarDraft = Omit<CalendarEvent, "id">;

export const CATEGORY_OPTIONS: { id: CalEventCategory; label: string }[] = [
  { id: "chapter", label: "Chapter" },
  { id: "social", label: "Social" },
  { id: "fundy", label: "Fundraiser" },
  { id: "program", label: "Program" },
  { id: "party", label: "Party" },
  { id: "deadline", label: "Deadline" },
  { id: "service", label: "Community Service" },
];

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const _now = new Date();
const TODAY = { year: _now.getFullYear(), month: _now.getMonth(), day: _now.getDate() };

export function CalendarEventForm({
  initialEvent,
  submitLabel,
  onSubmit,
  allowedCategories,
  defaultCategory = "chapter",
  minDate,
  maxDate,
}: {
  initialEvent?: CalendarEvent;
  submitLabel: string;
  onSubmit: (draft: CalendarDraft) => void;
  /** When set, only these categories appear in the dropdown (e.g. programming page). */
  allowedCategories?: CalEventCategory[];
  defaultCategory?: CalEventCategory;
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
  const [category, setCategory] = useState<CalEventCategory>(initialEvent?.category ?? defaultCategory);
  const [mandatory, setMandatory] = useState(initialEvent?.mandatory ?? false);
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const categoryOptions = allowedCategories
    ? CATEGORY_OPTIONS.filter(o => allowedCategories.includes(o.id))
    : CATEGORY_OPTIONS.filter(option =>
        option.id !== "deadline" && option.id !== "party" || option.id === initialEvent?.category
      );

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
              const selected = category === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategory(option.id)}
                  className={`cef-chip${selected ? " on" : ""}`}
                  style={{ ["--cdot" as string]: `var(--c-${option.id})` }}
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
