// What the model read this turn, and which records an answer's picture is of.
//
// Split out of lib/ai-shapes so each family of builders (lib/ai-shapes-*.ts)
// can share it without importing the dispatcher that imports them.

import type { AnswerRow } from "@/lib/ai-tools";

// ────────────────────────────────────────────────────────────────────────────
// Evidence — what the model read this turn, by tool name
// ────────────────────────────────────────────────────────────────────────────

export interface EvidenceRead {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ShapeEvidence {
  add(toolName: string, args: Record<string, unknown>, result: unknown): void;
  /** The most recent successful call of a tool, if it ran this turn. */
  get(toolName: string): { args: Record<string, unknown>; result: unknown } | undefined;
  /** The most recent successful call of ANY of these tools. */
  latest(toolNames: readonly string[]): EvidenceRead | undefined;
}

export function createShapeEvidence(): ShapeEvidence {
  const seen = new Map<string, { args: Record<string, unknown>; result: unknown; seq: number }>();
  let seq = 0;
  return {
    add(toolName, args, result) {
      if (typeof result === "object" && result !== null && "error" in result) return;
      seen.set(toolName, { args, result, seq: seq++ });
    },
    get: toolName => {
      const hit = seen.get(toolName);
      return hit ? { args: hit.args, result: hit.result } : undefined;
    },
    latest(toolNames) {
      let best: EvidenceRead & { seq: number } | undefined;
      for (const tool of toolNames) {
        const hit = seen.get(tool);
        if (hit && (!best || hit.seq > best.seq)) best = { tool, args: hit.args, result: hit.result, seq: hit.seq };
      }
      return best ? { tool: best.tool, args: best.args, result: best.result } : undefined;
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Selection — which records are in the picture
//
// 1. The source is the most recent successful call of a tool the shape accepts.
// 2. If the model's rows ALL resolve to records in that source and there are
//    fewer of them than the row cap, the set is exactly those records: the model
//    listed a deliberate subset.
// 3. Otherwise the set is the whole source, capped; a capped set says so
//    (`truncated`) so totals and counts are never drawn over a sample.
//
// Rows resolve by id-carrying payloads, not by RefIndex: a title that repeats
// (nine "Chapter Meeting"s) is matched on title + the row's own `date`.
// ────────────────────────────────────────────────────────────────────────────

/** One record of a source, as a builder needs to find it again. */
export interface SourceRecord {
  id: number;
  title: string;
  date: string | null;
  raw: Record<string, unknown>;
}

export type SourceReader = (result: unknown, args: Record<string, unknown>) => SourceRecord[];

export interface Selection {
  tool: string;
  args: Record<string, unknown>;
  records: SourceRecord[];
  /** Set when the source had more records than the shape's cap. */
  truncated: { of: number } | null;
  /** True when the set is the model's own rows rather than the whole source. */
  subset: boolean;
}

/** The compose_answer row cap — a model row list this long may itself be a cut. */
export const MODEL_ROW_CAP = 6;

function norm(s: string): string {
  return s.toLowerCase().replace(/[.,;:!?'"()]/g, "").replace(/\s+/g, " ").trim();
}

/** Resolve each row to exactly one record, or null when any row doesn't. */
export function resolveRows(rows: ReadonlyArray<Pick<AnswerRow, "title" | "date">>, records: SourceRecord[]): SourceRecord[] | null {
  const byTitle = new Map<string, SourceRecord[]>();
  for (const r of records) {
    const k = norm(r.title);
    byTitle.set(k, [...(byTitle.get(k) ?? []), r]);
  }
  const out: SourceRecord[] = [];
  const used = new Set<number>();
  for (const row of rows) {
    const same = byTitle.get(norm(row.title)) ?? [];
    const hits = row.date ? same.filter(r => r.date === row.date) : same;
    if (hits.length !== 1 || used.has(hits[0].id)) return null;
    used.add(hits[0].id);
    out.push(hits[0]);
  }
  return out;
}

export function selectFromEvidence(input: {
  evidence: ShapeEvidence;
  /** The tools this shape accepts as a source, each with how to read its records. */
  sources: Record<string, SourceReader>;
  rows: ReadonlyArray<Pick<AnswerRow, "title" | "date">>;
  cap: number;
}): Selection | null {
  const read = input.evidence.latest(Object.keys(input.sources));
  if (!read) return null;
  let all: SourceRecord[];
  try { all = input.sources[read.tool](read.result, read.args); } catch { return null; }
  if (input.rows.length > 0 && input.rows.length < MODEL_ROW_CAP) {
    const picked = resolveRows(input.rows, all);
    if (picked) return { tool: read.tool, args: read.args, records: picked, truncated: null, subset: true };
  }
  return {
    tool: read.tool,
    args: read.args,
    records: all.slice(0, input.cap),
    truncated: all.length > input.cap ? { of: all.length } : null,
    subset: false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Readers for the common list payloads
// ────────────────────────────────────────────────────────────────────────────

/** A list tool returns a bare array, or listResult's empty envelope ({count: 0, items: []}). */
export function listItems(result: unknown): Record<string, unknown>[] {
  const arr = Array.isArray(result)
    ? result
    : typeof result === "object" && result !== null && Array.isArray((result as { items?: unknown }).items)
      ? (result as { items: unknown[] }).items
      : [];
  return arr.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
}

export function prop(result: unknown, key: string): unknown {
  return typeof result === "object" && result !== null ? (result as Record<string, unknown>)[key] : undefined;
}

/** Records out of an array of objects, by which keys hold the title and date. */
export function recordsOf(items: unknown, titleKey: string, dateKey: string | null): SourceRecord[] {
  if (!Array.isArray(items)) return [];
  const out: SourceRecord[] = [];
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const id = r.id;
    const title = r[titleKey];
    if (typeof id !== "number" || !Number.isInteger(id) || typeof title !== "string") continue;
    const date = dateKey && typeof r[dateKey] === "string" ? (r[dateKey] as string) : null;
    out.push({ id, title, date, raw: r });
  }
  return out;
}
