// The shape an Ask Chapt answer asks to be drawn as — the model's half of
// lib/ai-shapes. Split out with no app imports so lib/ai-tools (which parses
// compose_answer) and lib/ai-shapes (which builds from ai-tools' helpers) don't
// import each other.

import { isValidCalendarDate } from "@/lib/dates";
import type { RankMetric, TallyMetric, YesNoTest } from "@/lib/api-types";

/** The shapes that shipped before the list forms (docs/ask-chapt-list-forms-plan.md). */
export const LEGACY_SHAPE_TYPES = ["tally", "breakdown", "week", "missing"] as const;
/** The list forms: each replaces the plain row list when every record qualifies. */
export const FORM_SHAPE_TYPES = ["dated", "logbook", "pastdue", "ranked", "table", "roll", "yesno", "status", "record", "zero"] as const;
export const SHAPE_TYPES = [...LEGACY_SHAPE_TYPES, ...FORM_SHAPE_TYPES] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
export const TALLY_METRICS = ["owes_dues", "at_risk", "no_service_hours"] as const satisfies readonly TallyMetric[];
export const RANK_METRICS = ["service_hours", "gpa", "attendance", "dues_owed", "event_attendance"] as const satisfies readonly RankMetric[];
export const ROLL_SPLITS = ["excused", "paid"] as const;
export const YESNO_TESTS = ["dues_paid", "task_done", "attended", "service_met", "gpa_met", "voted"] as const satisfies readonly YesNoTest[];
export type RollSplit = (typeof ROLL_SPLITS)[number];

/**
 * ASK_CHAPT_FORMS=1 offers the list forms to the model (schema + prompt) and
 * builds them. Off, the model is never told they exist and a request for one is
 * dropped; clients always know how to draw them either way.
 */
export function formsEnabled(): boolean {
  return process.env.ASK_CHAPT_FORMS === "1";
}

/** The shape types advertised in compose_answer's schema this deployment. */
export function offeredShapeTypes(): string[] {
  return formsEnabled() ? [...SHAPE_TYPES] : [...LEGACY_SHAPE_TYPES];
}

/** What the model asked for, sanitized. Never reaches the wire. */
export interface ShapeRequest {
  type: ShapeType;
  metric?: TallyMetric;
  start?: string;
  /** missing only: the thing the user named that couldn't be found. */
  term?: string;
  /** ranked only: the one number every row carries. */
  rank?: RankMetric;
  /** table only: 2 to 4 measures, in column order. */
  metrics?: RankMetric[];
  /** roll only: a two-way split computed from the source. */
  split?: RollSplit;
  /** yesno only: the test every record must pass. */
  test?: YesNoTest;
  /** status only: "done" when the finished rows are the answer. */
  focus?: "open" | "done";
}

/** Unknown types and malformed fields are dropped, never fatal — the answer still goes out as rows. */
export function parseShapeRequest(raw: unknown): ShapeRequest | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== "string" || !offeredShapeTypes().includes(r.type)) return undefined;
  const metric = typeof r.metric === "string" && (TALLY_METRICS as readonly string[]).includes(r.metric)
    ? (r.metric as TallyMetric) : undefined;
  const start = typeof r.start === "string" && isValidCalendarDate(r.start) ? r.start : undefined;
  const term = typeof r.term === "string" && r.term.trim() ? r.term.trim().slice(0, 60) : undefined;
  const isRank = (v: unknown): v is RankMetric => typeof v === "string" && (RANK_METRICS as readonly string[]).includes(v);
  // `metric` names a tally subset for tally and a measure for ranked: one
  // property in the schema, read through the type's own closed set.
  const rank = r.type === "ranked" && isRank(r.metric) ? r.metric : undefined;
  const metrics = r.type === "table" && Array.isArray(r.metrics)
    ? [...new Set(r.metrics.filter(isRank).filter(m => m !== "event_attendance"))].slice(0, 4) : undefined;
  const split = r.type === "roll" && typeof r.split === "string" && (ROLL_SPLITS as readonly string[]).includes(r.split) ? (r.split as RollSplit) : undefined;
  return {
    type: r.type as ShapeType,
    ...(metric && r.type === "tally" ? { metric } : {}),
    ...(start ? { start } : {}),
    ...(term ? { term } : {}),
    ...(rank ? { rank } : {}),
    ...(metrics?.length ? { metrics } : {}),
    ...(split ? { split } : {}),
    ...(r.type === "yesno" && typeof r.test === "string" && (YESNO_TESTS as readonly string[]).includes(r.test) ? { test: r.test as YesNoTest } : {}),
    ...(r.type === "status" && (r.focus === "open" || r.focus === "done") ? { focus: r.focus } : {}),
  };
}
