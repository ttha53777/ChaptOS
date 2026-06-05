/**
 * Date helpers. Pure functions over local date components — safe to import
 * from both client and server code (no server-only deps).
 */

// Matches a "YYYY-MM-DD" calendar-date string. Shared by the Zod validators
// (z.string().regex(DATE_RE)) and the AI tool layer (DATE_RE.test(...)).
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
