/**
 * Date helpers. Pure functions over local date components — safe to import
 * from both client and server code (no server-only deps).
 */

// Matches a "YYYY-MM-DD" calendar-date string. Shared by the Zod validators
// (z.string().regex(DATE_RE)) and the AI tool layer (DATE_RE.test(...)).
//
// NOTE: this is a SHAPE check only — it accepts impossible calendars like
// "2026-02-31" or "2026-13-01". Downstream date math (Date.UTC) silently rolls
// those over to a different real date. Where that matters, pair it with
// isValidCalendarDate(). The shared regex stays shape-only to avoid changing
// behavior for every entity at once; tightening it globally is a coordinated PR.
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date in "YYYY-MM-DD" form — rejects both the
 * wrong shape and well-formed-but-impossible dates ("2026-02-31", "2026-13-01").
 * Parses the components and confirms they round-trip through a UTC Date, so a
 * rollover (Feb 31 → Mar 3) is caught instead of silently accepted.
 */
export function isValidCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Inclusive Mon–Sun bounds (as local "YYYY-MM-DD") of the calendar week
// containing `today`. Uses local date components — toISOString() would shift
// the date across the UTC boundary.
export function isoWeekBounds(today: Date): { start: string; end: string } {
  const diffToMon = (today.getDay() + 6) % 7; // Sun(0)->6, Mon(1)->0, ... Sat(6)->5
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: toISO(monday), end: toISO(sunday) };
}
