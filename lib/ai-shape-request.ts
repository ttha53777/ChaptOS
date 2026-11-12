// The shape an Ask Chapt answer asks to be drawn as — the model's half of
// lib/ai-shapes. Split out with no app imports so lib/ai-tools (which parses
// compose_answer) and lib/ai-shapes (which builds from ai-tools' helpers) don't
// import each other.

import { isValidCalendarDate } from "@/lib/dates";
import type { RankMetric, TallyMetric, YesNoTest } from "@/lib/api-types";

/** The shapes that shipped before the list forms (docs/ask-chapt-list-forms-plan.md). */
export const LEGACY_SHAPE_TYPES = ["tally", "breakdown", "week", "missing"] as const;
/** The list forms: each replaces the plain row list when every record qualifies. */
export const FORM_SHAPE_TYPES = ["dated", "logbook", "pastdue", "ranked", "table", "roll", "yesno", "status", "record", "zero", "receipt"] as const;
/** The answer system's blocks (docs/ask-chapt-answer-system-plan.md). */
export const KIT_SHAPE_TYPES = ["figure", "steps", "decline", "reasons", "quote"] as const;
export const SHAPE_TYPES = [...LEGACY_SHAPE_TYPES, ...FORM_SHAPE_TYPES, ...KIT_SHAPE_TYPES] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
export const TALLY_METRICS = ["owes_dues", "at_risk", "no_service_hours"] as const satisfies readonly TallyMetric[];
export const RANK_METRICS = ["service_hours", "gpa", "attendance", "dues_owed", "event_attendance"] as const satisfies readonly RankMetric[];
export const ROLL_SPLITS = ["excused", "paid"] as const;
export const YESNO_TESTS = ["dues_paid", "task_done", "attended", "service_met", "gpa_met", "voted"] as const satisfies readonly YesNoTest[];
export type RollSplit = (typeof ROLL_SPLITS)[number];
export const FIGURE_METRICS = ["balance", "members"] as const;
export type FigureMetric = (typeof FIGURE_METRICS)[number];
export const REASON_JUDGMENTS = ["attendance"] as const;

/**
 * ASK_CHAPT_FORMS=1 offers the list forms to the model (schema + prompt) and
 * builds them. Off, the model is never told they exist and a request for one is
 * dropped; clients always know how to draw them either way.
 */
export function formsEnabled(): boolean {
  return process.env.ASK_CHAPT_FORMS === "1";
}

/**
 * ASK_CHAPT_ANSWER_KIT=1 offers the answer system's blocks (figure, steps,
 * decline, reasons, quote) and askback `areas` the same way: off, the model is
 * never told they exist and a request for one is dropped.
 */
export function kitEnabled(): boolean {
  return process.env.ASK_CHAPT_ANSWER_KIT === "1";
}

/** The shape types advertised in compose_answer's schema this deployment. */
export function offeredShapeTypes(): string[] {
  return [
    ...LEGACY_SHAPE_TYPES,
    ...(formsEnabled() ? FORM_SHAPE_TYPES : []),
    ...(kitEnabled() ? KIT_SHAPE_TYPES : []),
  ];
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
  /** receipt only: which total leads. */
  headline?: "out" | "in" | "net";
  /** figure only: which quantity. */
  figure?: FigureMetric;
  /** steps only: the playbook key (lib/ai-howto.ts decides whether it exists). */
  playbook?: string;
  /** steps only: example values for the playbook's own fields, by field label. */
  examples?: Record<string, string>;
  /** reasons only. */
  judgment?: "attendance";
  /** quote only: the meeting's id as search_meeting_notes returned it. */
  meeting?: number;
  /** quote only: index into that meeting's summary decisions. */
  decision?: number;
  /** quote only: the passage, which must appear word for word in the minutes. */
  quote?: string;
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
    ...(r.type === "receipt" && (r.headline === "out" || r.headline === "in" || r.headline === "net") ? { headline: r.headline } : {}),
    ...(r.type === "figure" && typeof r.metric === "string" && (FIGURE_METRICS as readonly string[]).includes(r.metric) ? { figure: r.metric as FigureMetric } : {}),
    ...(r.type === "steps" && typeof r.playbook === "string" && /^[a-z_]{1,40}$/.test(r.playbook) ? { playbook: r.playbook } : {}),
    ...(r.type === "steps" ? examplesOf(r.examples) : {}),
    ...(r.type === "reasons" ? { judgment: "attendance" as const } : {}),
    ...(r.type === "quote" && Number.isInteger(r.meeting) ? { meeting: r.meeting as number } : {}),
    ...(r.type === "quote" && Number.isInteger(r.decision) && (r.decision as number) >= 0 ? { decision: r.decision as number } : {}),
    ...(r.type === "quote" && typeof r.quote === "string" && r.quote.trim() ? { quote: r.quote.trim().slice(0, 400) } : {}),
  };
}

/** Steps examples: at most 6 short plain-text values; the builder keeps only the playbook's own field labels. */
function examplesOf(raw: unknown): { examples?: Record<string, string> } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 6)) {
    if (typeof v === "string" && v.trim()) out[k.slice(0, 40)] = v.trim().slice(0, 40);
  }
  return Object.keys(out).length ? { examples: out } : {};
}
