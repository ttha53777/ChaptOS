"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { scheduleDate, scheduleTime } from "@/lib/calendar-feed/schedule";
import { ScheduleFields, initialSchedule, scheduleFromValue } from "./ScheduleFields";
import type { CalendarEvent } from "../../data";
import { toDateStr } from "../../lib/dates";
import { DETAIL_KINDS, detailSummary, fromTemplate, type EventDetail } from "@/lib/event-details";
import { EventDetailsEditor, type DetailMember } from "./EventDetailsEditor";
import { DETAIL_ICON, UI_ICON } from "./detail-icons";
import { repeatDates, type Repeat } from "@/lib/event-repeat";
import "./calendar-event-form.css";
import "./event-details.css";
import "./event-landing.css";

// `collab` is programming-only (the timeline's calendar events don't carry it); it's
// optional on the draft and populated solely when the form is rendered with `showCollab`.
// `rememberDetails` is sent only when the More-details page is on: true saves a blank
// copy of the details as the category's template, false clears the one it had.
// `repeat` is set only on a new event with the Repeat switch on: the server
// creates one event per week (or every other week) through `repeat.until`.
export type CalendarDraft = Omit<CalendarEvent, "id"> & { collab?: string; rememberDetails?: boolean; repeat?: Repeat };

/** A selectable category chip. `color` is optional — when absent the chip falls
 *  back to the CSS var `--c-<slug>` (used by the Programming page's built-in set). */
export interface CategoryOption {
  slug: string;
  label: string;
  color?: string;
  mandatoryDefault?: boolean;
  /** Blank details a new event of this type opens with (CalendarEventType.detailTemplate). */
  detailTemplate?: EventDetail[] | null;
}

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const _now = new Date();
const TODAY = { year: _now.getFullYear(), month: _now.getMonth(), day: _now.getDate() };

/** "Sat, Oct 24 · 11:00–3:00" for the details page header — just enough to orient. */
function fmtWhen(v: { mode: string; date: string; startTime: string; endTime: string; legacyTime: string }): string {
  let d = v.date;
  try { d = new Date(`${v.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch { /* keep the raw date */ }
  const t12 = (t: string) => { const [h, m] = t.split(":").map(Number); if (!Number.isFinite(h)) return t; const ap = h >= 12 ? "pm" : "am"; return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${ap}`; };
  if (v.mode === "allDay") return `${d} · all day`;
  if (v.mode === "timed" && v.startTime) return `${d} · ${t12(v.startTime)}${v.endTime ? `–${t12(v.endTime)}` : ""}`;
  return v.legacyTime ? `${d} · ${v.legacyTime}` : d;
}

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
  more: icon(<><rect x="7" y="3" width="13" height="15" rx="2" /><path d="M4 7v12a2 2 0 0 0 2 2h10" /><path d="M13.5 8v5M11 10.5h5" /></>),
  repeat: icon(<><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>),
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00`).getDay()];
const shortDate = (date: string) => new Date(`${date}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const addWeeks = (date: string, weeks: number) => { const d = new Date(`${date}T12:00`); d.setDate(d.getDate() + weeks * 7); return toDateStr(d.getFullYear(), d.getMonth(), d.getDate()); };

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
  detailMembers,
  initialPage = 1,
  onPageChange,
  draft,
  failure,
  initialDate,
  allowRepeat = false,
  termLabel,
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
  /** Turns on the "More details" page (real calendar events only). The roster the
   *  contact and "who's bringing what" pickers choose from. */
  detailMembers?: DetailMember[];
  /** Open straight onto the details page (the rail's "Add details"). */
  initialPage?: 1 | 2;
  /** Page 2 is wide; the caller widens its Modal while it shows. */
  onPageChange?: (page: 1 | 2) => void;
  /** A new event's form exactly as it was submitted — the timeline reopens it this
   *  way when the save fails, so nothing typed is lost. */
  draft?: CalendarDraft;
  /** Why that save failed, shown on top; `field` marks the input at fault. */
  failure?: { message: string; field?: "date" };
  /** Prefill a new event on this day (YYYY-MM-DD) instead of today. */
  initialDate?: string;
  /** Offer the Repeat switch on a new event; "End of term" repeats through `maxDate`. */
  allowRepeat?: boolean;
  /** The active term's name, for the "End of term" choice. */
  termLabel?: string;
}) {
  // Default a new event to today, but clamp into the semester so the prefilled
  // date isn't already out of range (string dates compare lexicographically).
  const today = toDateStr(TODAY.year, TODAY.month, TODAY.day);
  const defaultDate = initialDate ?? (minDate && today < minDate ? minDate : maxDate && today > maxDate ? maxDate : today);
  // Prefill: the event being edited, else a failed add's draft, else blank.
  const seed = initialEvent ?? draft;
  const [title, setTitle] = useState(seed?.title ?? "");
  const [when, setWhen] = useState(() => initialSchedule(seed?.schedule, { date: seed?.date ?? defaultDate, time: seed?.time, isNew: !initialEvent }));
  const [scheduleError, setScheduleError] = useState("");
  const initialCategory = seed?.category ?? defaultCategory ?? categoryOptions[0]?.slug ?? "";
  const [category, setCategory] = useState<string>(initialCategory);
  const [mandatory, setMandatory] = useState(
    seed?.mandatory ?? categoryOptions.find(o => o.slug === initialCategory)?.mandatoryDefault ?? false,
  );
  const [collab, setCollab] = useState(initialCollab ?? draft?.collab ?? "");
  const [location, setLocation] = useState(seed?.location ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const detailsOn = detailMembers != null;
  const templateOf = (slug: string) => categoryOptions.find(o => o.slug === slug)?.detailTemplate ?? null;
  const [page, setPage] = useState<1 | 2>(detailMembers != null ? initialPage : 1);
  const [details, setDetails] = useState<EventDetail[]>(() => seed ? (seed.details ?? []) : fromTemplate(templateOf(initialCategory)));
  // A new event follows its category's template until the officer changes a detail.
  const [detailsTouched, setDetailsTouched] = useState(!!seed);
  const [remember, setRemember] = useState(() => draft?.rememberDetails ?? !!templateOf(initialCategory)?.length);
  const [focusDetail, setFocusDetail] = useState<string | null>(null);
  // Which way the last page turn went, so the new page slides in from that side.
  // Null until the first turn: the opening page just arrives with the sheet.
  const [turn, setTurn] = useState<"in-r" | "in-l" | null>(null);
  // Repeat (new events only). Until defaults to the end of the term when there is one.
  const [repeatOn, setRepeatOn] = useState(!!draft?.repeat);
  const [repeatEvery, setRepeatEvery] = useState<1 | 2>(draft?.repeat?.every ?? 1);
  const [repeatToTerm, setRepeatToTerm] = useState(!draft?.repeat || draft.repeat.until === maxDate);
  const [repeatUntil, setRepeatUntil] = useState(draft?.repeat?.until ?? "");
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
    setRemember(!!option.detailTemplate?.length);
    if (!detailsTouched) setDetails(fromTemplate(option.detailTemplate));
  }

  function goTo(next: 1 | 2, focus?: string) {
    if (next !== page) setTurn(next > page ? "in-r" : "in-l");
    setPage(next);
    setFocusDetail(focus ?? null);
    onPageChange?.(next);
  }
  function changeDetails(next: EventDetail[]) { setDetails(next); setDetailsTouched(true); }

  // Service events are created through their own route, which doesn't repeat.
  const canRepeat = allowRepeat && !initialEvent && category !== "service" && when.mode !== "legacy";
  const termEnd = maxDate && when.date <= maxDate ? maxDate : undefined;
  const toTerm = repeatToTerm && !!termEnd;
  const untilDate = toTerm ? termEnd! : (repeatUntil && repeatUntil >= when.date ? repeatUntil : addWeeks(when.date, 6));
  const repeat: Repeat | undefined = canRepeat && repeatOn ? { every: repeatEvery, until: untilDate } : undefined;
  const repeatCount = repeat ? repeatDates(when.date, repeat).length : 0;
  const repeatLast = repeat && repeatCount ? repeatDates(when.date, repeat)[repeatCount - 1] : "";
  const noun = (n: number) => (category === "chapter" ? "meeting" : "event") + (n === 1 ? "" : "s");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (repeat && repeatCount < 2) return;
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
      ...(repeat ? { repeat } : {}),
      ...(detailsOn ? {
        details,
        // Only say something about the template when there's one to save or clear.
        ...(remember || templateOf(category)?.length ? { rememberDetails: remember } : {}),
      } : {}),
    });
  }

  const selected = categoryOptions.find(o => o.slug === category);
  const categoryHint = category === "party" ? "Guest list and wrap-up live on the Parties page."
    : selected?.mandatoryDefault ? `${selected.label} events are required by default.`
    : "";
  const catColor = selected?.color ?? `var(--c-${category})`;
  const catLabel = selected?.label ?? category;
  const nameOf = (id: number) => detailMembers?.find(m => m.id === id)?.name;
  const submitDisabled = !title.trim() || (!!repeat && repeatCount < 2);
  // "Add event" becomes "Add 7 meetings" so the button says what will happen.
  const submitText = repeat && repeatCount >= 2 && !initialEvent ? `Add ${repeatCount} ${noun(repeatCount)}` : submitLabel;

  const foot = (
    <div className="cef-foot">
      <span className="cef-kbd"><kbd>⌘</kbd> <kbd>↵</kbd> to {initialEvent ? "save" : "add"}</span>
      <div className="cef-btns">
        {onCancel && <button type="button" className="cef-btn ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="cef-btn primary" disabled={submitDisabled}>{submitText}</button>
      </div>
    </div>
  );

  // The Modal mounts outside the page's `.dash` wrapper. `.cef-root` carries just
  // the dusk theme *tokens* (no page-wrapper layout) so the form sits flush in the
  // Modal body — see calendar-event-form.css. Callers open the Modal with
  // `hideHeader`: this form owns the kicker, and the Modal's floating ✕ lines up with it.
  return (
    <div className="cef-root">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`cef cef-sheet${detailsOn ? " has-details" : ""}${failure?.field === "date" ? " err-date" : ""}`}
        data-page={page}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); formRef.current?.requestSubmit(); return; }
          // Escape on the details page steps back to the event instead of closing.
          if (e.key === "Escape" && page === 2) { e.preventDefault(); e.stopPropagation(); goTo(1); }
        }}
      >
        {detailsOn && (
          <div className="cef-tabs" role="tablist" aria-label="Event pages">
            <button type="button" role="tab" aria-selected={page === 1} onClick={() => goTo(1)}>
              {UI_ICON.cal}Event
            </button>
            <button type="button" role="tab" aria-selected={page === 2} onClick={() => goTo(2)}>
              {UI_ICON.pages}More details{details.length > 0 && <span className="n">{details.length}</span>}
            </button>
          </div>
        )}

        {page === 2 ? (
          <div key="p2" className={`cef-p2 cef-page${turn ? ` ${turn}` : ""}`}>
            <header className="cef-p2-head">
              <button type="button" className="cef-back" aria-label="Back to event" onClick={() => goTo(1)}>{UI_ICON.back}</button>
              <div className="t">
                <span className="cef-kicker">More details</span>
                <h2 className={title.trim() ? "" : "untitled"}>{title.trim() || "Untitled event"}</h2>
                <div className="meta">
                  <span className="cdot" style={{ ["--cdot" as string]: catColor }}>{catLabel}</span>
                  <span>{fmtWhen(when)}</span>
                  {location.trim() && <span>{location.trim()}</span>}
                </div>
              </div>
            </header>
            <EventDetailsEditor
              details={details}
              onChange={changeDetails}
              category={category}
              categoryLabel={catLabel}
              categoryColor={catColor}
              members={detailMembers ?? []}
              focus={focusDetail}
            />
            <div className="cef-foot">
              <label className="cef-rem">
                <span className="cef-sw">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  <span className="track" aria-hidden />
                </span>
                <span className="txt">
                  Start every <span className="cd" style={{ background: catColor }} /><b>{catLabel}</b> event with these
                  <small>{remember ? `New ${catLabel} events open with the same details, blank.` : "Off — this event only."}</small>
                </span>
              </label>
              <div className="cef-btns">
                <button type="button" className="cef-btn ghost" onClick={() => goTo(1)}>Back to event</button>
                <button type="submit" className="cef-btn primary" disabled={submitDisabled}>{submitText}</button>
              </div>
            </div>
          </div>
        ) : (<div key="p1" className={`cef-p1 cef-page${turn ? ` ${turn}` : ""}`}>
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
        {failure && (
          <div className="cef-err-band" role="alert">
            <span className="ic" aria-hidden>!</span>
            <div><b>Not added. Nothing was lost.</b><span className="w">{failure.message}</span></div>
          </div>
        )}

        <div className="cef-rows">
          {/* When — a real start/end is what subscribed calendars can show */}
          <div className="cef-r">
            {ICONS.when}
            <div>
              <ScheduleFields variant="inline" value={when} onChange={setWhen} minDate={minDate} maxDate={maxDate} />
              {scheduleError && <p role="alert" className="cef-hint sched-warn cef-r-note">{scheduleError}</p>}
            </div>
          </div>

          {/* Repeat — a switch first; how often and until when only once it's on */}
          {canRepeat && (
            <div className="cef-r">
              {ICONS.repeat}
              <div>
                <label className="cef-req">
                  <span>
                    <span className="t">Repeat</span>
                    <span className="s">{repeatOn ? `${repeatEvery === 1 ? "Every" : "Every other"} ${weekdayOf(when.date)}` : "Make this a weekly or every-other-week series."}</span>
                  </span>
                  <span className="cef-sw">
                    <input type="checkbox" checked={repeatOn} onChange={e => setRepeatOn(e.target.checked)} />
                    <span className="track" aria-hidden />
                  </span>
                </label>
                {repeatOn && (
                  <div className="cef-rp">
                    <div className="cef-seg" role="group" aria-label="How often">
                      <button type="button" aria-pressed={repeatEvery === 1} onClick={() => setRepeatEvery(1)}>Weekly</button>
                      <button type="button" aria-pressed={repeatEvery === 2} onClick={() => setRepeatEvery(2)}>Every 2 weeks</button>
                    </div>
                    <div className="cef-until" role="radiogroup" aria-label="Until">
                      <span className="k">Until</span>
                      <button type="button" role="radio" className="cef-pick" aria-checked={toTerm} aria-disabled={!termEnd} disabled={!termEnd} onClick={() => setRepeatToTerm(true)}>
                        <span className="rad" aria-hidden />End of term
                        <small>{!maxDate ? "No term set" : !termEnd ? "Term ends first" : `${termLabel ? `${termLabel} · ` : ""}${shortDate(termEnd)}`}</small>
                      </button>
                      {toTerm ? (
                        <button type="button" role="radio" className="cef-pick" aria-checked={false} onClick={() => { setRepeatToTerm(false); if (!repeatUntil) setRepeatUntil(untilDate); }}>
                          <span className="rad" aria-hidden />A date
                        </button>
                      ) : (
                        <label className="cef-pick" role="radio" aria-checked>
                          <span className="rad" aria-hidden />
                          <input type="date" aria-label="Last day" value={untilDate} min={when.date} max={maxDate} onChange={e => setRepeatUntil(e.target.value)} />
                        </label>
                      )}
                    </div>
                    {repeatCount >= 2 ? (
                      <p className="cef-rp-sum">
                        <span><b>{repeatEvery === 1 ? "Every" : "Every other"} {weekdayOf(when.date)}</b> · <span className="nw">{shortDate(when.date)} → {shortDate(repeatLast)}</span></span>
                        <span className="n">{repeatCount} {noun(repeatCount)}</span>
                      </p>
                    ) : (
                      <p className="cef-rp-sum warn" role="alert">Pick an end date at least {repeatEvery === 1 ? "a week" : "two weeks"} after {shortDate(when.date)}.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

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

          {/* The door to page 2 — or, once there are details, their stamps. */}
          {detailsOn && (
            <div className="cef-r">
              {ICONS.more}
              <div>
                {details.length === 0 ? (
                  <button type="button" className="cef-more" onClick={() => goTo(2)}>
                    <span className="fan"><i data-hue="mint">{DETAIL_ICON.checklist}</i><i data-hue="butter">{DETAIL_ICON.budget}</i><i data-hue="sky">{DETAIL_ICON.contact}</i></span>
                    <span className="txt"><span className="t">More details</span><span className="s">Checklist, budget, contacts, links — or a field of your own.</span></span>
                    <span className="go">{UI_ICON.arrow}</span>
                  </button>
                ) : (
                  <>
                    <div className="cef-stamps">
                      {details.map(d => {
                        const label = detailSummary(d, nameOf) ?? DETAIL_KINDS[d.type].name;
                        return (
                          <button key={d.id} type="button" className="cef-stamp" data-hue={DETAIL_KINDS[d.type].hue} title={label} onClick={() => goTo(2, d.id)}>
                            <span className="ti">{DETAIL_ICON[d.type]}</span><span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="cef-stamps-foot">
                      <span className="mini">{details.length} extra detail{details.length > 1 ? "s" : ""} saved with this event</span>
                      <button type="button" className="cef-link" onClick={() => goTo(2)}>Edit details →</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {foot}
        </div>)}
      </form>
    </div>
  );
}
