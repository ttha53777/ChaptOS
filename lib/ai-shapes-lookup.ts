// Lookup-shaped answers (docs/ask-chapt-list-forms-plan.md §4.5, §4.12): The
// record (`record`) and Nothing yet (`zero`).
//
// The record is the peek card itself, built by peek-service exactly as the
// peek sheet builds it — same reads, same permissions — so an inline card can
// never show more than tapping the row would. It's for lookups only ("when is
// the next…", "who is our…"); a count that came back short keeps its own form.
//
// Nothing yet answers "none" without leaving a doubt: it names the filter in
// the org's own word, says how much was searched, and shows what those records
// ARE filed as. v1 covers calendar events filtered by type. A filter word that
// isn't one of the org's types is never a zero — the model asks which it meant.

import type { db } from "@/lib/db";
import type { AnswerRow, ToolAccess } from "@/lib/ai-tools";
import { PROPOSAL_META } from "@/lib/ai-tools";
import { hasPermission } from "@/lib/permissions";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import { listItems, type ShapeEvidence } from "@/lib/ai-shape-evidence";
import { DATE_RE, isValidCalendarDate } from "@/lib/dates";
import type { PeekCard, RecordShape, ZeroShape } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";
import { periodLabel } from "@/lib/ai-shapes-calendar";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string; access?: ToolAccess; peek?: (type: "member" | "event" | "task", id: number) => Promise<PeekCard> }

export const RECORD_MAX = 2;
export const ZERO_INSTEAD_MAX = 5;

// ────────────────────────────────────────────────────────────────────────────
// The record
// ────────────────────────────────────────────────────────────────────────────

/** Pure: rows + their cards → the record. Each card is its row's own; nothing is combined. */
export function recordFromCards(pairs: Array<{ row: AnswerRow; card: PeekCard }>): BuiltShape<RecordShape> | null {
  if (pairs.length === 0 || pairs.length > RECORD_MAX) return null;
  return { shape: { type: "record", cards: pairs.map(p => p.card) }, rows: pairs.map(p => p.row) };
}

export async function buildRecord(_req: ShapeRequest, _evidence: ShapeEvidence, _scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  if (!o.peek) return null;
  // Rows carry the refs the route matched against this turn's reads; a row
  // without one has no record behind it, so there's no card to show.
  const withRef = o.rows.filter(r => r.ref);
  if (withRef.length === 0 || withRef.length > RECORD_MAX || withRef.length !== o.rows.length) return null;
  const pairs: Array<{ row: AnswerRow; card: PeekCard }> = [];
  // Sequential: each peek is a few scoped reads, and the pool is two connections.
  for (const row of withRef) {
    try { pairs.push({ row, card: await o.peek(row.ref!.type, row.ref!.id) }); }
    catch { return null; }
  }
  return recordFromCards(pairs);
}

// ────────────────────────────────────────────────────────────────────────────
// Nothing yet
// ────────────────────────────────────────────────────────────────────────────

/** Pure: the unfiltered window, grouped → the zero, or null when the filter isn't one of the org's types. */
export function zeroFromCounts(input: {
  filterSlug: string;
  types: Array<{ slug: string; label: string }>;
  /** Events in the same window, ignoring the type filter. */
  window: Array<{ category: string }>;
  period: string;
  scope: string;
  canCreate: boolean;
}): BuiltShape<ZeroShape> | null {
  const label = new Map(input.types.map(t => [t.slug, t.label]));
  // The model may pass the label ("Service") where the column holds the slug.
  const slug = label.has(input.filterSlug)
    ? input.filterSlug
    : input.types.find(t => t.label.toLowerCase() === input.filterSlug.trim().toLowerCase())?.slug;
  if (!slug) return null;
  const filter = label.get(slug)!;
  // The read came back empty; if the window says otherwise, it isn't a zero.
  if (input.window.some(e => e.category === slug)) return null;
  const counts = new Map<string, number>();
  for (const e of input.window) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  const instead = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, ZERO_INSTEAD_MAX)
    .map(([slug, count]) => ({ slug, label: label.get(slug) ?? slug, count }));
  return {
    shape: {
      type: "zero",
      filter,
      slug,
      noun: "events",
      period: input.period,
      searched: { count: input.window.length, scope: input.scope },
      instead,
      canCreate: input.canCreate,
    },
    rows: [],
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const okDate = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v) && isValidCalendarDate(v);

function canPlan(access?: ToolAccess): boolean {
  const perm = PROPOSAL_META.propose_add_calendar_event.perm;
  if (!access) return false;
  return !perm || access.isPlatformAdmin || access.isOrgAdmin || hasPermission(access.permissions, perm);
}

export async function buildZero(_req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  const read = evidence.get("list_calendar_events");
  if (!read || typeof read.args.category !== "string") return null;
  if (listItems(read.result).length > 0) return null;
  const start = okDate(read.args.start) ? read.args.start : undefined;
  const end = okDate(read.args.end) ? read.args.end : undefined;
  const types = await scoped.calendarEventType.findMany({ select: { slug: true, label: true } });
  const window = await scoped.calendarEvent.findMany({
    where: start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {},
    select: { category: true },
  });
  const scope = start && end ? `${fmt(start)} – ${fmt(end)}` : start ? `since ${fmt(start)}` : end ? `through ${fmt(end)}` : "on the calendar";
  return zeroFromCounts({
    filterSlug: read.args.category,
    types,
    window,
    period: await periodLabel(scoped, read.args),
    scope,
    canCreate: canPlan(o.access),
  });
}
