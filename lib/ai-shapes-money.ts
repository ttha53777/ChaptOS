// The money form (docs/ask-chapt-list-forms-plan.md §4.9): Receipt.
//
// Every row is a ledger line from list_transactions this turn, and the totals
// are summed here from exactly the lines sent, so the receipt can't disagree
// with itself. A cut set (more lines than fit) draws its lines and no sum:
// a total over a sample is a wrong total.

import type { db } from "@/lib/db";
import type { AnswerRow } from "@/lib/ai-tools";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import { listItems, narrowToRows, recordsOf, type ShapeEvidence, type SourceRecord } from "@/lib/ai-shape-evidence";
import { fmtUsd } from "@/lib/money";
import type { ReceiptShape } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";
import { fmtDay, periodLabel } from "@/lib/ai-shapes-calendar";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string }

export const RECEIPT_MAX = 24;

export interface Line extends SourceRecord {
  cents: number;
  type: "income" | "expense";
  category: string;
  pending: boolean;
}

export function fmtCents(cents: number, signed = false): string {
  const s = fmtUsd(Math.abs(cents) / 100);
  return cents < 0 ? `− ${s}` : signed ? `+ ${s}` : s;
}

/** Pure: ledger lines → the receipt. Totals only over the whole set. */
export function receiptFromLines(input: {
  lines: Line[];
  headline?: ReceiptShape["headline"];
  kicker: string;
  categoryLabels: Map<string, string>;
  rows: AnswerRow[];
}): BuiltShape<ReceiptShape> | null {
  if (input.lines.length === 0) return null;
  const newestFirst = [...input.lines].sort((a, b) => b.date!.localeCompare(a.date!));
  const pick = narrowToRows(newestFirst, input.rows, RECEIPT_MAX);
  const byId = new Map(input.lines.map(l => [l.id, l]));
  const set = pick.records.map(r => byId.get(r.id)!).sort((a, b) => a.date!.localeCompare(b.date!) || a.id - b.id);
  const signed = (l: Line) => (l.type === "expense" ? -Math.abs(l.cents) : Math.abs(l.cents));
  const out = set.filter(l => l.type === "expense").reduce((s, l) => s + Math.abs(l.cents), 0);
  const inn = set.filter(l => l.type === "income").reduce((s, l) => s + Math.abs(l.cents), 0);
  const headline = input.headline
    ?? (set.every(l => l.type === "expense") ? "out" : set.every(l => l.type === "income") ? "in" : "net");
  const shape: ReceiptShape = {
    type: "receipt",
    kicker: input.kicker,
    headline,
    totals: pick.truncated ? null : { out, in: inn, net: inn - out },
    items: set.map(l => ({ date: l.date!, cents: signed(l), pending: l.pending })),
    truncated: pick.truncated,
  };
  const rows: AnswerRow[] = set.map(l => ({
    kind: "money",
    title: l.title || (input.categoryLabels.get(l.category) ?? l.category),
    subtitle: [fmtDay(l.date!), input.categoryLabels.get(l.category) ?? l.category, l.pending ? "pending" : null].filter(Boolean).join(" · "),
    value: fmtCents(signed(l), true),
    ref: { type: "transaction", id: l.id },
  }));
  return { shape, rows };
}

export async function buildReceipt(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  const read = evidence.get("list_transactions");
  if (!read) return null;
  const lines: Line[] = recordsOf(listItems(read.result), "description", "date").flatMap(r => {
    const x = r.raw;
    if (typeof x.amountCents !== "number" || (x.type !== "income" && x.type !== "expense") || !r.date) return [];
    return [{ ...r, cents: x.amountCents, type: x.type, category: typeof x.category === "string" ? x.category : "", pending: x.pending === true }];
  });
  if (lines.length === 0) return null;
  const cats = await scoped.transactionCategory.findMany({ select: { slug: true, label: true } });
  const labels = new Map(cats.map(c => [c.slug, c.label]));
  // The kicker names the read's own filter, in the org's words.
  let what = "Ledger";
  if (typeof read.args.event_id === "number") {
    const ev = await scoped.calendarEvent.findFirst({ where: { id: read.args.event_id }, select: { title: true } });
    if (ev) what = ev.title;
  } else if (typeof read.args.category === "string") {
    what = labels.get(read.args.category) ?? read.args.category;
  } else if (typeof read.args.search === "string" && read.args.search.trim()) {
    what = `“${read.args.search.trim()}”`;
  }
  const period = await periodLabel(scoped, read.args);
  return receiptFromLines({ lines, headline: req.headline, kicker: period === "All time" ? what : `${what} · ${period}`, categoryLabels: labels, rows: o.rows });
}
