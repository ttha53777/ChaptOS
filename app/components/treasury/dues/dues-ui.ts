import type { DuesChargeSummary, DuesStanding } from "@/lib/api-types/dues";
import { daysBetween } from "@/lib/dues-ledger";
import { fmtUsd } from "@/lib/money";

/** Display order everywhere a list is grouped by standing: the ones to chase first. */
export const STANDING_ORDER: DuesStanding[] = ["overdue", "due", "paid", "none"];

/** The punch strip reads left to right as progress: settled first, gaps last. */
export const STRIP_ORDER: DuesStanding[] = ["paid", "due", "overdue", "none"];

export const STANDING: Record<DuesStanding, { lane: string; chip: string; hint: string }> = {
  overdue: { lane: "Overdue",       chip: "Overdue",        hint: "Past their due date" },
  due:     { lane: "Owes · Active", chip: "Not due yet",    hint: "Billed, still inside the window" },
  paid:    { lane: "Paid up",       chip: "Paid up",        hint: "Nothing left on the tab" },
  none:    { lane: "Nothing billed", chip: "Nothing billed", hint: "Not on any charge yet" },
};

export const money = fmtUsd;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" → "Oct 1". */
export function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Each charge's stub colour: stable per charge, neutral for the carried-over balance. */
const CHARGE_TONES = ["butter", "lilac", "peach", "sky", "mint"] as const;
export function chargeTone(c: Pick<DuesChargeSummary, "id" | "audienceKind">): string {
  if (c.audienceKind === "carryover") return "var(--card-3)";
  return `var(--pp-${CHARGE_TONES[c.id % CHARGE_TONES.length]})`;
}

/** "$140 ea" or "$90–140". */
export function chargeAmounts(c: Pick<DuesChargeSummary, "amounts">): { text: string; each: boolean } {
  const a = c.amounts;
  if (a.length === 1) return { text: money(a[0]), each: true };
  return { text: `${money(a[0])}–${money(a[a.length - 1]).slice(1)}`, each: false };
}

/** The short status under a tag's amount: "12d late", "due Oct 30". */
export function standingLine(s: DuesStanding, lateDays: number, nextDueDate: string | null): string {
  if (s === "overdue") return `${lateDays}d late`;
  if (s === "due") return nextDueDate ? `due ${fmtDay(nextDueDate)}` : "owes";
  return "";
}

/** "Overdue · 18 days" / "Due in 11 days" / "No due date" for one open line. */
export function dueLine(dueDate: string | null, today: string): string {
  if (!dueDate) return "No due date";
  const d = daysBetween(today, dueDate);
  if (d < 0) return `Overdue · ${plural(-d, "day")}`;
  if (d === 0) return "Due today";
  return `Due in ${plural(d, "day")}`;
}

/** Two initials for an avatar fallback. */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
