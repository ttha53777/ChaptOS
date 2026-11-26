// Entity refs for answer rows — how a tapped result row knows what record it is.
//
// A compose_answer row is display text ({kind, title, subtitle, value}); nothing
// in it identifies the underlying record, so the client can't open anything. This
// module attaches a {type, id} ref by matching each row's title against the ids
// the model ALREADY saw in this turn's tool results.
//
// Why match server-side instead of asking the model for the id:
//   - Cost. A `ref` property on the compose_answer schema rides in the tools array
//     on every request and every loop iteration, and the model would spend output
//     tokens per row emitting it — output tokens are the slow part of the stream.
//     Matching here costs one in-memory walk over payloads already being
//     JSON.stringify'd for the model.
//   - Safety. Every id reachable here came out of a ctx.db tool call that was
//     already org-scoped, so membership in this index is a STRONGER guarantee than
//     re-checking existence: an id the model invented simply isn't in the set, and
//     a cross-org id could never have entered it. No validation round trip needed
//     (each scoped query is BEGIN + SET LOCAL + query + COMMIT — see lib/db/tenant),
//     and none of it lands on the critical path before the answer paints.
//
// A row that doesn't match keeps its `ask` and behaves exactly as it does today.

import type { AnswerRow } from "./ai-tools";
import type { AnswerRowEvent, AnswerRowTurnout } from "@/lib/api-types";

/** Record kinds an answer row can open. Mirrors PeekType in lib/services/peek-service. */
export const REF_TYPES = ["member", "event", "task", "transaction"] as const;
export type RefType = (typeof REF_TYPES)[number];

export interface EntityRef {
  type: RefType;
  id: number;
}

/** What this turn's reads said about an event — drawn on its row, never taken from the model's text. */
export type EventFacts = AnswerRowEvent;
type EventTurnout = AnswerRowTurnout;

interface Collected extends EntityRef {
  label: string;
  /** YYYY-MM-DD, when the tool row carried one. */
  date?: string;
  turnout?: EventTurnout;
}

function isoDay(v: unknown): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined;
}

function turnoutOf(v: unknown): EventTurnout | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const c = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x) : null);
  const attended = n(c.attended), absent = n(c.absent), excused = n(c.excused) ?? 0;
  return attended == null || absent == null ? undefined : { attended, absent, excused };
}

// ────────────────────────────────────────────────────────────────────────────
// Extraction
//
// Type comes from the tool name and the path within its result, never from the
// shape: a Task and a CalendarEvent are both {id, title, date}, so a generic
// walk for "objects with an id" would mistype half of them. Declared per tool,
// in the style of TOOL_UI — tools not listed here contribute nothing.
// ────────────────────────────────────────────────────────────────────────────

/** Pull {id, label} pairs out of an array-ish value under `key`, or the value itself. */
function fromList(value: unknown, labelKey: "name" | "title" | "description", type: RefType): Collected[] {
  if (!Array.isArray(value)) return [];
  const out: Collected[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const id = r.id;
    const label = r[labelKey];
    if (typeof id === "number" && Number.isInteger(id) && id > 0 && typeof label === "string" && label.trim()) {
      const date = type === "event" || type === "task" ? isoDay(r.date) : undefined;
      out.push({ type, id, label: label.trim(), ...(date ? { date } : {}) });
    }
  }
  return out;
}

/** Pull a single {id, label} record — the get_* tools' direct-hit shape. */
function fromRecord(value: unknown, labelKey: "name" | "title" | "description", type: RefType): Collected[] {
  return fromList([value], labelKey, type);
}

function prop(result: unknown, key: string): unknown {
  return typeof result === "object" && result !== null
    ? (result as Record<string, unknown>)[key]
    : undefined;
}

/**
 * A list tool returns either a bare array or, when empty, the listResult envelope
 * ({count: 0, items: [], hint}). Both are handled — the envelope yields nothing.
 */
function listRows(result: unknown): unknown {
  if (Array.isArray(result)) return result;
  return prop(result, "items");
}

type Extractor = (result: unknown) => Collected[];

const EXTRACTORS: Record<string, Extractor> = {
  list_brothers: r => fromList(prop(r, "brothers"), "name", "member"),
  get_brother: r => [
    // Direct hit is the record itself; a fuzzy name match returns candidates.
    ...fromRecord(r, "name", "member"),
    ...fromList(prop(r, "candidates"), "name", "member"),
  ],
  get_brother_attendance: r => [
    ...fromRecord(prop(r, "brother"), "name", "member"),
    ...fromList(prop(r, "candidates"), "name", "member"),
  ],
  list_calendar_events: r => fromList(listRows(r), "title", "event"),
  search_meeting_notes: r => fromList(listRows(r), "title", "event"),
  get_event_attendance: r => [
    // The one read that carries turnout: counts ride on the event it describes.
    ...fromRecord(prop(r, "event"), "title", "event").map(e => {
      const turnout = turnoutOf(prop(r, "counts"));
      return turnout ? { ...e, turnout } : e;
    }),
    ...fromList(prop(r, "candidates"), "title", "event"),
  ],
  list_deadlines: r => fromList(listRows(r), "title", "task"),
  list_transactions: r => fromList(listRows(r), "description", "transaction"),
  get_custom_metrics: r => fromList(prop(r, "members"), "name", "member"),
  list_member_fields: r => fromList(prop(r, "members"), "name", "member"),
  list_reimbursements: r => fromList(prop(r, "reimbursements"), "name", "member"),
  list_dues_payments: r => fromList(prop(r, "payments"), "name", "member"),
  list_dues_charges: r => fromList(prop(r, "members"), "name", "member"),
  list_attendance_exemptions: r => fromList(listRows(r), "name", "member"),
  list_polls: r => (Array.isArray(r) ? r.flatMap(p => fromList(prop(p, "notVoted"), "name", "member")) : []),
  weekly_digest: r => [
    ...fromList(prop(r, "events"), "title", "event"),
    ...fromList(prop(r, "deadlinesDue"), "title", "task"),
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// The index
// ────────────────────────────────────────────────────────────────────────────

/** Case/space/punctuation-insensitive key. Titles are echoed verbatim by the model. */
function normalize(label: string): string {
  return label
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE_PATTERNS: Array<[RegExp, (m: RegExpExecArray) => string | null]> = [
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, m => `${m[2]}-${m[3]}`],
  [/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g, m => md(+m[1], +m[2])],
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi, m => md(MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2])],
];
function md(month: number, day: number): string | null {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}

/** Month-days ("10-05") a row's text names — how "Chapter Meeting 11/10" says which of nine it is. */
export function monthDaysIn(text: string): string[] {
  const out = new Set<string>();
  for (const [re, f] of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) { const v = f(m as RegExpExecArray); if (v) out.add(v); }
  }
  return [...out];
}

/** The title with any date written into it removed, so "CHAPTER MEETING 11/10" keys as "chapter meeting". */
function stripDates(title: string): string {
  let t = title;
  for (const [re] of DATE_PATTERNS) t = t.replace(re, " ");
  return t.replace(/\s[-–—·]\s*$/, "").trim();
}

/** A label that resolved to more than one id — never guessed at, always dropped. */
const AMBIGUOUS = Symbol("ambiguous");
type Slot = Collected | typeof AMBIGUOUS;

/** The row `kind` the model chose narrows which type a label may resolve to. */
const KIND_TO_TYPE: Partial<Record<AnswerRow["kind"], RefType>> = {
  person: "member",
  event: "event",
  task: "task",
};

export interface RefIndex {
  /** Fold one tool result in. Unknown tools and malformed payloads are no-ops. */
  add(toolName: string, result: unknown): void;
  /**
   * Resolve a row's title, or null when unseen or ambiguous. Same-titled events
   * (nine "Chapter Meeting"s) resolve when the row's date — its own `date`, or
   * one written in its title/subtitle — picks out exactly one of them.
   */
  lookup(title: string, kind: AnswerRow["kind"], hint?: { date?: string; text?: string }): EntityRef | null;
  /** What this turn's reads said about an event: its date, and its turnout if attendance was read. */
  eventFacts(id: number): EventFacts | null;
  /** Distinct records seen this turn — telemetry only. */
  size(): number;
  /** Every label that resolves to exactly one record, as the tool wrote it. */
  entries(): Array<{ label: string; ref: EntityRef }>;
}

export function createRefIndex(): RefIndex {
  // Two views of the same records: kind-qualified (a "person" row may only match
  // a member) and bare (a "money"/"generic" row may match anything). Ambiguity is
  // tracked per view, so two same-named records of DIFFERENT types still resolve
  // for a typed row while correctly refusing to for an untyped one.
  const byTypeLabel = new Map<string, Slot>();
  const byLabel = new Map<string, Slot>();
  // Every distinct dated record per kind-qualified label, kept even once the
  // label is ambiguous, so a date can still pick one out.
  const dated = new Map<string, Map<number, string>>();
  const facts = new Map<number, { date?: string; turnout?: EventTurnout }>();

  function put(map: Map<string, Slot>, key: string, ref: Collected) {
    const existing = map.get(key);
    if (!existing) { map.set(key, ref); return; }
    if (existing === AMBIGUOUS) return;
    // The same record seen twice (two tools, one member) is not ambiguity.
    if (existing.type === ref.type && existing.id === ref.id) return;
    map.set(key, AMBIGUOUS);
  }

  function read(map: Map<string, Slot>, key: string): EntityRef | null {
    const hit = map.get(key);
    if (!hit || hit === AMBIGUOUS) return null;
    return { type: hit.type, id: hit.id };
  }

  return {
    add(toolName, result) {
      const extract = EXTRACTORS[toolName];
      if (!extract) return;
      let found: Collected[];
      // Tool payloads are shaped by tool code, but this runs mid-stream on the
      // answer path — a surprise shape must not take the whole turn down.
      try { found = extract(result); } catch { return; }
      for (const ref of found) {
        const key = normalize(ref.label);
        if (!key) continue;
        put(byTypeLabel, `${ref.type}|${key}`, ref);
        put(byLabel, key, ref);
        if (ref.date) {
          const k = `${ref.type}|${key}`;
          if (!dated.has(k)) dated.set(k, new Map());
          dated.get(k)!.set(ref.id, ref.date);
        }
        if (ref.type === "event") {
          const f = facts.get(ref.id) ?? {};
          facts.set(ref.id, { date: ref.date ?? f.date, turnout: ref.turnout ?? f.turnout });
        }
      }
    },

    lookup(title, kind, hint) {
      const type = KIND_TO_TYPE[kind];
      const key = normalize(title);
      if (!key) return null;
      const direct = type ? read(byTypeLabel, `${type}|${key}`) : read(byLabel, key);
      if (direct || type !== "event") return direct;
      // Same-titled meetings: let the row's date choose. Exact ISO first, then
      // a month-day written in the row — accepted only when it picks out one.
      const bare = normalize(stripDates(title));
      const pool = dated.get(`event|${bare}`) ?? dated.get(`event|${key}`);
      if (!pool) return null;
      const entries = [...pool.entries()];
      if (hint?.date) {
        const hit = entries.filter(([, d]) => d === hint.date);
        if (hit.length === 1) return { type: "event", id: hit[0][0] };
      }
      const mds = monthDaysIn(`${title} ${hint?.text ?? ""}`);
      if (mds.length === 1) {
        const hit = entries.filter(([, d]) => d.slice(5) === mds[0]);
        if (hit.length === 1) return { type: "event", id: hit[0][0] };
      }
      return null;
    },

    eventFacts(id) {
      const f = facts.get(id);
      return f?.date ? { date: f.date, turnout: f.turnout ?? null } : null;
    },

    size() {
      return byTypeLabel.size;
    },

    entries() {
      const out: Array<{ label: string; ref: EntityRef }> = [];
      for (const slot of byLabel.values()) {
        if (slot !== AMBIGUOUS) out.push({ label: slot.label, ref: { type: slot.type, id: slot.id } });
      }
      return out;
    },
  };
}

/** At most this many names in one reply become chips; past that it's a list, not prose. */
export const NOTE_REFS_MAX = 12;

/**
 * The records a plain-text reply names, so the client can make them tappable
 * (answer system, `note_refs`). Only labels this turn's reads resolved to one
 * record, matched as whole words, longest first so "Winter Formal Deposit"
 * wins over "Winter Formal"; each label once. Pure.
 */
export function noteRefs(text: string, index: RefIndex): Array<{ text: string; ref: EntityRef }> {
  const taken: Array<[number, number]> = [];
  const out: Array<{ text: string; ref: EntityRef }> = [];
  const labels = index.entries()
    .filter(e => e.label.trim().length >= 3)
    .sort((a, b) => b.label.length - a.label.length);
  for (const { label, ref } of labels) {
    if (out.length >= NOTE_REFS_MAX) break;
    const esc = label.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "iu").exec(text);
    if (!m) continue;
    const span: [number, number] = [m.index, m.index + m[0].length];
    if (taken.some(([a, b]) => span[0] < b && a < span[1])) continue;
    taken.push(span);
    out.push({ text: m[0], ref });
  }
  return out;
}

/**
 * Attach refs to the rows of a parsed compose_answer. Pure — returns new rows,
 * leaving unmatched ones untouched (they keep `ask` and today's behavior).
 */
export function attachRefs(rows: AnswerRow[], index: RefIndex): AnswerRow[] {
  return rows.map(row => {
    const ref = row.ref ?? index.lookup(row.title, row.kind, { date: row.date, text: row.subtitle });
    if (!ref) return row;
    const event = ref.type === "event" ? index.eventFacts(ref.id) : null;
    return { ...row, ref, ...(event ? { event } : {}) };
  });
}
