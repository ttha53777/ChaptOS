// The shape an Ask Chapt answer asks to be drawn as — the model's half of
// lib/ai-shapes. Split out with no app imports so lib/ai-tools (which parses
// compose_answer) and lib/ai-shapes (which builds from ai-tools' helpers) don't
// import each other.

import { isValidCalendarDate } from "@/lib/dates";
import type { TallyMetric } from "@/lib/api-types";

export const SHAPE_TYPES = ["tally", "breakdown", "week", "missing"] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
export const TALLY_METRICS = ["owes_dues", "at_risk", "no_service_hours"] as const satisfies readonly TallyMetric[];

/** What the model asked for, sanitized. Never reaches the wire. */
export interface ShapeRequest {
  type: ShapeType;
  metric?: TallyMetric;
  start?: string;
  /** missing only: the thing the user named that couldn't be found. */
  term?: string;
}

/** Unknown types and malformed fields are dropped, never fatal — the answer still goes out as rows. */
export function parseShapeRequest(raw: unknown): ShapeRequest | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== "string" || !(SHAPE_TYPES as readonly string[]).includes(r.type)) return undefined;
  const metric = typeof r.metric === "string" && (TALLY_METRICS as readonly string[]).includes(r.metric)
    ? (r.metric as TallyMetric) : undefined;
  const start = typeof r.start === "string" && isValidCalendarDate(r.start) ? r.start : undefined;
  const term = typeof r.term === "string" && r.term.trim() ? r.term.trim().slice(0, 60) : undefined;
  return { type: r.type as ShapeType, ...(metric ? { metric } : {}), ...(start ? { start } : {}), ...(term ? { term } : {}) };
}
