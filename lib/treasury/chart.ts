/**
 * The paper Treasury's two instruments as numbers: the running-balance step line and the
 * category breakdown. The web draws them in app/components/treasury/PaperTreasury.tsx,
 * the app in mobile/src/treasury/; both draw from this model, so the line ends on the same
 * balance and the flag says the same thing.
 *
 * Pure. Dates are YYYY-MM-DD calendar days counted in UTC days (no time zone involved).
 */
import type { ChartEntry } from "./ledger";

const DAY = 864e5;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const dn = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Math.round(Date.UTC(y!, m! - 1, d!) / DAY); };
export const isoOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const plusDays = (iso: string, k: number) => isoOfDay(dn(iso) + k);
export const fmtD = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${MON[m! - 1]} ${d}`; };
export const dowOf = (iso: string) => DOW[new Date(dn(iso) * DAY).getUTCDay()]!;
const r2 = (v: number) => Math.round(v * 100) / 100;
export const m0 = (v: number) => (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const m2 = (v: number) => (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const kfmt = (v: number) => (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) % 1000 ? 1 : 0) + "k" : Math.round(Math.abs(v)));

export type ChartRange = "2w" | "1m" | "term";

export interface BalanceModel {
  st: string; x0: string; end: string; span: number; lo: number; hi: number; asOf: string;
  pts: [string, number][]; fut: [string, number][];
  balAt: (iso: string) => number; projAt: (iso: string) => number;
  /** 0..1000 across the plot. */
  X: (iso: string) => number;
  /** 0..200 down the plot. */
  Y: (v: number) => number;
  posted: ChartEntry[]; scheduled: ChartEntry[];
}

/**
 * The running balance. Posted money dated after `asOf` is pulled back onto it and
 * scheduled money dated before it is pushed forward onto it, so the solid line ends
 * exactly on the balance the hero prints and the dashed line only ever runs forward.
 */
export function balanceModel(opening: number, postedIn: readonly ChartEntry[], schedIn: readonly ChartEntry[], termStart: string, asOf: string, range: ChartRange): BalanceModel {
  const posted = postedIn.map(e => ({ ...e, date: e.date > asOf ? asOf : e.date })).sort((a, b) => a.date.localeCompare(b.date));
  const scheduled = schedIn.map(e => ({ ...e, date: e.date < asOf ? asOf : e.date })).sort((a, b) => a.date.localeCompare(b.date));
  const balAt = (iso: string) => r2(opening + posted.reduce((s, e) => (e.date <= iso ? s + e.amount : s), 0));
  const bal = balAt(asOf);
  const projAt = (iso: string) => r2(bal + scheduled.reduce((s, e) => (e.date <= iso ? s + e.amount : s), 0));

  let st = range === "2w" ? plusDays(asOf, -14) : range === "1m" ? plusDays(asOf, -30) : termStart;
  if (st < termStart) st = termStart;
  if (st > asOf) st = asOf;
  const lastSched = scheduled.length ? scheduled[scheduled.length - 1]!.date : null;
  let end = range === "term" ? plusDays(lastSched && lastSched > asOf ? lastSched : asOf, 4) : plusDays(asOf, range === "2w" ? 8 : 18);
  const x0 = plusDays(st, -2);
  if (dn(end) - dn(x0) < 21) end = plusDays(x0, 21);
  const span = dn(end) - dn(x0);

  const pts: [string, number][] = [[st, balAt(plusDays(st, -1))]];
  [...new Set(posted.filter(e => e.date >= st && e.date <= asOf).map(e => e.date))].sort().forEach(d => pts.push([d, balAt(d)]));
  const fut: [string, number][] = [[asOf, bal]];
  [...new Set(scheduled.filter(e => e.date <= end).map(e => e.date))].sort().forEach(d => { if (d > asOf) fut.push([d, projAt(d)]); else fut[0] = [asOf, projAt(asOf)]; });
  // A scheduled entry clamped onto asOf would bend the solid line's end; start the dashed
  // run from the real balance and drop to it on the next step instead.
  if (fut[0]![1] !== bal) fut.splice(0, 1, [asOf, bal], [plusDays(asOf, 1), fut[0]![1]]);

  const vals = [...pts, ...fut].map(p => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.18, 400);
  // Never pad the axis below zero for a balance that never went there.
  const floor0 = lo >= 0;
  lo = Math.floor((lo - pad) / 500) * 500; hi = Math.ceil((hi + pad) / 500) * 500;
  if (floor0 && lo < 0) lo = 0;
  const X = (iso: string) => ((dn(iso) - dn(x0)) / span) * 1000;
  const Y = (v: number) => 200 - ((v - lo) / (hi - lo)) * 200;
  return { st, x0, end, span, lo, hi, asOf, pts, fut, balAt, projAt, X, Y, posted, scheduled };
}

/** Everything the chart prints around the line. */
export function balanceMarks(c: BalanceModel) {
  const { X, Y } = c;
  const bal = c.balAt(c.asOf);
  const delta = r2(bal - c.balAt(plusDays(c.st, -1)));
  const step = (arr: [string, number][]) => arr.map((p, i) => (i ? `H${X(p[0]).toFixed(1)} V${Y(p[1]).toFixed(1)}` : `M${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`)).join(" ");
  const line = `${step(c.pts)} H${X(c.asOf).toFixed(1)}`;
  const area = `${line} V200 H${X(c.st).toFixed(1)} Z`;
  const hasFut = c.fut.length > 1;
  const fut = hasFut ? `${step(c.fut)} H${X(c.end).toFixed(1)}` : "";
  const grid = [0, 0.5, 1].map(k => c.lo + (c.hi - c.lo) * k);
  const months: string[] = [];
  { const d = new Date(dn(c.x0) * DAY); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    while (isoOfDay(Math.round(d.getTime() / DAY)) <= c.end) { months.push(isoOfDay(Math.round(d.getTime() / DAY))); d.setUTCMonth(d.getUTCMonth() + 1); } }
  const lf = c.fut[c.fut.length - 1]!;
  const lastSched = c.scheduled.length ? c.scheduled[c.scheduled.length - 1]! : null;
  return {
    bal, delta, line, area, hasFut, fut, grid, months, lf, lastSched,
    /** Today's point, in % of the plot. */
    tx: X(c.asOf) / 10, ty: Y(bal) / 2,
    deltaText: `${delta >= 0 ? "▲" : "▼"} ${m0(Math.abs(delta))} since ${fmtD(c.st)}`,
    projText: lastSched ? { n: c.scheduled.length, to: m0(c.projAt(c.end)), by: fmtD(lastSched.date) } : null,
    endFlag: `${m0(lf[1])} after ${fmtD(lf[0])}`,
  };
}

/** The flag at the line's end: "Today · $2,288" or "Closed Dec 18 · $2,288". */
export const todayFlag = (c: BalanceModel, isToday: boolean, bal: number) => `${isToday ? "Today" : `Closed ${fmtD(c.asOf)}`} · ${m0(bal)}`;

/** What a scrub at `iso` shows. */
export function scrubAt(c: BalanceModel, iso: string) {
  const isFut = iso > c.asOf;
  const v = isFut ? c.projAt(iso) : c.balAt(iso);
  return { isFut, v, x: c.X(iso) / 10, y: c.Y(v) / 2, ents: (isFut ? c.scheduled : c.posted).filter(e => e.date === iso), day: `${dowOf(iso)} · ${fmtD(iso)}` };
}

/** A pointer fraction (0..1 across the plot) → the day under it. */
export function dayAtFraction(c: BalanceModel, f: number): string {
  let iso = plusDays(c.x0, Math.round(Math.max(0, Math.min(1, f)) * c.span));
  if (iso < c.st) iso = c.st;
  return iso;
}

/* ── Breakdown ───────────────────────────────────────────────────────────────── */

export interface BreakdownRow { slug: string; label: string; value: number; color: string | null }

/** The sentence beside the ring, and its total. Null rows / nothing = the uncharged ring. */
export function breakdownLede(kind: "income" | "expense", rows: readonly BreakdownRow[]) {
  const word = kind === "income" ? "came in" : "went out";
  const total = rows.reduce((s, r) => s + r.value, 0);
  const top = rows[0];
  return {
    word, total,
    charged: rows.length > 0 && total > 0,
    single: rows.length === 1,
    top,
    topPct: top && total ? Math.round((top.value / total) * 100) : 0,
  };
}

/* ── Category colour lift ────────────────────────────────────────────────────── */

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/**
 * `oklch(from <hex> L calc(c * k) h)`, the web's lift (paper-treasury.css --tz-cl/--tz-cc:
 * day .87/.6, night .74/.7): a stored category ink becomes a pastel of the same hue.
 * Returns the hex unchanged when it isn't a #rrggbb.
 */
export function liftHex(hex: string, L: number, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => toLin(v / 255)) as [number, number, number];
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const C = Math.hypot(a, bb) * k, h = Math.atan2(bb, a);
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l2 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m2_ = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s2 = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  const out = [
    4.0767416621 * l2 - 3.3077115913 * m2_ + 0.2309699292 * s2,
    -1.2684380046 * l2 + 2.6097574011 * m2_ - 0.3413193965 * s2,
    -0.0041960863 * l2 - 0.7034186147 * m2_ + 1.7076147010 * s2,
  ].map(v => Math.round(Math.min(1, Math.max(0, toSrgb(v))) * 255));
  return `#${out.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}
