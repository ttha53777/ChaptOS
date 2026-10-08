/**
 * Agenda templates: the pure rules both the server and the browser need.
 *
 * A template body is plain text in the notes' own dialect — `## ` starts a
 * section, `[ ] ` a checklist line, `• ` a bullet — plus `{{field}}` blanks that
 * Add meeting fills from the meeting form when it copies the agenda into the new
 * meeting's notes. Only the fields below exist; anything else would land in
 * every meeting unfilled, so the service refuses to save it.
 *
 * No DB or server imports: the Templates page and MeetingForm import this.
 */

export const AGENDA_FIELDS = {
  meeting_title: "Meeting title",
  meeting_date:  "Date",
  meeting_time:  "Time",
  location:      "Location",
} as const;

export type AgendaField = keyof typeof AGENDA_FIELDS;
export type AgendaValues = Partial<Record<AgendaField, string>>;

export const AGENDA_NAME_MAX = 100;
export const AGENDA_DESCRIPTION_MAX = 160;
// Well under the notes' 50,000-character limit, so a filled copy always fits.
export const AGENDA_BODY_MAX = 20_000;
export const MAX_AGENDA_TEMPLATES_PER_ORG = 50;

// A fresh RegExp per call: a shared /g regex carries lastIndex between callers.
const fieldRe = () => /\{\{\s*([\w-]+)\s*\}\}/g;

export function isAgendaField(key: string): key is AgendaField {
  return Object.prototype.hasOwnProperty.call(AGENDA_FIELDS, key);
}

/** Every {{key}} in the body, in first-seen order, known or not. */
function fieldKeys(body: string): string[] {
  return [...new Set([...body.matchAll(fieldRe())].map(m => m[1]))];
}

/** The known fields a body leaves blank — what "Fills in by itself" lists. */
export function agendaFieldsIn(body: string): AgendaField[] {
  return fieldKeys(body).filter(isAgendaField);
}

/** {{keys}} the meeting form can't fill. Non-empty blocks a save. */
export function unknownAgendaFields(body: string): string[] {
  return fieldKeys(body).filter(k => !isAgendaField(k));
}

// ── Line shapes ───────────────────────────────────────────────────────────────
// The agenda/minutes dialect, read the way people actually type it: `#`–`###`
// with or without the space ("##Prez:"), but not "#1 priority"; `[ ]`/`[x]`
// with or without a leading "- "; `•`, `-` or `*` bullets.

const HEADING = /^(#{1,3})(?:[ \t]+|(?=[^\s#\d]))(.*\S)\s*$/;
const CHECK = /^((?:[-*•][ \t]+)?\[( |x|X)\])[ \t]?(.*)$/;
const BULLET = /^([-*•])[ \t]+(.*)$/;

/** A heading line's text and the length of its `#` marker, else null. */
export function headingOf(line: string): { text: string; marker: number } | null {
  const m = HEADING.exec(line);
  return m ? { text: m[2].trim(), marker: line.length - line.trimStart().length + m[1].length } : null;
}
/** A checklist line: its box (`[ ]`, `- [x]`…), whether it's ticked, and its text. */
export function checkOf(line: string): { box: string; done: boolean; text: string } | null {
  const m = CHECK.exec(line);
  return m ? { box: m[1], done: m[2] !== " ", text: m[3] } : null;
}
/** A bullet line's marker and text. Checklists aren't bullets. */
export function bulletOf(line: string): { marker: string; text: string } | null {
  if (checkOf(line)) return null;
  const m = BULLET.exec(line);
  return m ? { marker: m[1], text: m[2] } : null;
}

/** The section headings, in order. */
export function agendaSections(body: string): string[] {
  return body.split("\n").map(headingOf).filter((h): h is NonNullable<typeof h> => !!h && !!h.text).map(h => h.text);
}

/**
 * The agenda as it lands in a meeting's notes. A field the form left empty
 * reads "[Location]" rather than vanishing, so the minute-taker sees the gap.
 * Unknown keys are left as written (the service never saves one).
 */
export function fillAgenda(body: string, values: AgendaValues): string {
  return body.replace(fieldRe(), (match, key: string) => {
    if (!isAgendaField(key)) return match;
    const value = values[key]?.trim();
    return value || `[${AGENDA_FIELDS[key]}]`;
  });
}

/**
 * Whether a meeting has minutes. A meeting started from a template has notes
 * text from the moment it's created, so "has text" isn't enough: the notes
 * count only once they differ from the agenda that was copied in.
 */
export function hasMinutes(event: { description?: string | null; notesSeed?: string | null }): boolean {
  const notes = (event.description ?? "").trim();
  if (!notes) return false;
  const seed = (event.notesSeed ?? "").trim();
  return !seed || notes !== seed;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-12" → "Mon, Oct 12". Calendar arithmetic only, so no zone can shift it. */
export function formatAgendaDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function clock(hhmm: string): { text: string; half: "AM" | "PM" } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = +m[1];
  return { text: `${h % 12 || 12}:${m[2]}`, half: h < 12 ? "AM" : "PM" };
}

/** "19:30","21:00" → "7:30 – 9:00 PM"; "11:00","13:00" → "11:00 AM – 1:00 PM"; start only → "7:30 PM". */
export function formatAgendaTime(start: string, end = ""): string {
  const s = clock(start);
  if (!s) return "";
  const e = clock(end);
  if (!e) return `${s.text} ${s.half}`;
  return s.half === e.half ? `${s.text} – ${e.text} ${e.half}` : `${s.text} ${s.half} – ${e.text} ${e.half}`;
}

/**
 * The blanks' values for one meeting, from its form fields (times as local
 * HH:MM). `timeText` is a legacy "as written" time, used when there's no
 * structured start.
 */
export function agendaValues(m: { title: string; date: string; startTime?: string; endTime?: string; allDay?: boolean; timeText?: string | null; location?: string | null }): AgendaValues {
  return {
    meeting_title: m.title.trim(),
    meeting_date:  formatAgendaDate(m.date),
    meeting_time:  m.allDay ? "All day" : formatAgendaTime(m.startTime ?? "", m.endTime ?? "") || (m.timeText ?? "").trim(),
    location:      (m.location ?? "").trim(),
  };
}

/**
 * What the minute-taker actually wrote: the notes minus every line still
 * exactly as the agenda copied it in, keeping headings for structure.
 * An untouched "[ ] Task — owner — due date" is a placeholder, not an action
 * item, so this is what the summarizer reads. Without a seed it's the notes.
 */
export function minutesBeyondAgenda(event: { description?: string | null; notesSeed?: string | null }): string {
  const notes = event.description ?? "";
  const seed = event.notesSeed ?? "";
  if (!seed.trim()) return notes.trim();
  const untouched = new Set(seed.split("\n").map(l => l.trim()).filter(l => l && !headingOf(l)));
  return notes.split("\n").filter(l => !untouched.has(l.trim())).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
