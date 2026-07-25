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

/** Record kinds an answer row can open. Mirrors PeekType in lib/services/peek-service. */
export const REF_TYPES = ["member", "event", "task"] as const;
export type RefType = (typeof REF_TYPES)[number];

export interface EntityRef {
  type: RefType;
  id: number;
}

interface Collected extends EntityRef {
  label: string;
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
function fromList(value: unknown, labelKey: "name" | "title", type: RefType): Collected[] {
  if (!Array.isArray(value)) return [];
  const out: Collected[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const id = r.id;
    const label = r[labelKey];
    if (typeof id === "number" && Number.isInteger(id) && id > 0 && typeof label === "string" && label.trim()) {
      out.push({ type, id, label: label.trim() });
    }
  }
  return out;
}

/** Pull a single {id, label} record — the get_* tools' direct-hit shape. */
function fromRecord(value: unknown, labelKey: "name" | "title", type: RefType): Collected[] {
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
  get_event_attendance: r => [
    ...fromRecord(prop(r, "event"), "title", "event"),
    ...fromList(prop(r, "candidates"), "title", "event"),
  ],
  list_deadlines: r => fromList(listRows(r), "title", "task"),
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
  /** Resolve a row's title, or null when unseen or ambiguous. */
  lookup(title: string, kind: AnswerRow["kind"]): EntityRef | null;
  /** Distinct records seen this turn — telemetry only. */
  size(): number;
}

export function createRefIndex(): RefIndex {
  // Two views of the same records: kind-qualified (a "person" row may only match
  // a member) and bare (a "money"/"generic" row may match anything). Ambiguity is
  // tracked per view, so two same-named records of DIFFERENT types still resolve
  // for a typed row while correctly refusing to for an untyped one.
  const byTypeLabel = new Map<string, Slot>();
  const byLabel = new Map<string, Slot>();

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
      }
    },

    lookup(title, kind) {
      const key = normalize(title);
      if (!key) return null;
      const type = KIND_TO_TYPE[kind];
      return type ? read(byTypeLabel, `${type}|${key}`) : read(byLabel, key);
    },

    size() {
      return byTypeLabel.size;
    },
  };
}

/**
 * Attach refs to the rows of a parsed compose_answer. Pure — returns new rows,
 * leaving unmatched ones untouched (they keep `ask` and today's behavior).
 */
export function attachRefs(rows: AnswerRow[], index: RefIndex): AnswerRow[] {
  return rows.map(row => {
    const ref = index.lookup(row.title, row.kind);
    return ref ? { ...row, ref } : row;
  });
}
