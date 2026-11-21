/**
 * Reading a clock time out of an event's legacy free-text time (pure: the feed, the
 * web's schedule fields and the app's event form share it; re-exported from
 * ./schedule).
 */
/** Read a clock time out of legacy free text ("7:30 PM", "19:00", "7-9pm").
 *  A time typed alone with no AM/PM ("7:30", "8") is read as PM: chapter events
 *  are evenings, and older forms didn't ask. New times must say (`timeIsClear`).
 *  The feed publishes what this reads; anything else unclear yields nothing. */
export function parseLegacyTime(text: string): { start?: string; end?: string } {
  const bare = /^\s*([1-9]|1[0-2])(?::([0-5]\d))?\s*$/.exec(text);
  if (bare) return { start: `${String(Number(bare[1]) % 12 + 12).padStart(2, "0")}:${bare[2] ?? "00"}` };
  return readClock(text);
}
export const UNCLEAR_TIME = "Add AM or PM to the time, e.g. 7:30 PM.";
/** Whether a newly typed time says AM or PM, or is 24-hour ("19:00", "07:30").
 *  "7:30" alone is refused so no new event depends on the PM reading above. */
export function timeIsClear(text: string): boolean {
  const t = text.trim();
  return !t || /^all[\s-]?day$/i.test(t) || readClock(t).start !== undefined;
}
function readClock(text: string): { start?: string; end?: string } {
  // Whole numbers only ("204" is not 8pm); a/p only as a suffix ("7 at" is not 7am).
  const token = /(?<!\d)(\d{1,2})(?::(\d{2}))?(?!\d)\s*(?:(a|p)(?:\.?\s*m\.?)?(?![a-z]))?/gi;
  const found = [...text.toLowerCase().matchAll(token)].slice(0, 2).map(m => ({ h: Number(m[1]), m: Number(m[2] ?? 0), mer: m[3] as "a" | "p" | undefined, raw: m[0] }));
  const clock = (t: typeof found[number], mer = t.mer) => {
    if (t.m > 59 || t.h > 23) return undefined;
    let h = t.h;
    if (mer) { if (h < 1 || h > 12) return undefined; h = (h % 12) + (mer === "p" ? 12 : 0); }
    else if (!(h >= 13 || /^0\d/.test(t.raw))) return undefined; // bare "7" could be either
    return `${String(h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;
  };
  const [a, b] = found;
  if (!a) return {};
  const end = b ? clock(b) : undefined;
  // "7-9pm": the start borrows the end's meridiem when that keeps it before the end.
  const start = clock(a) ?? (b?.mer && end ? [clock(a, b.mer), clock(a, b.mer === "p" ? "a" : "p")].find(v => v && v < end) : undefined);
  return { start, end };
}
