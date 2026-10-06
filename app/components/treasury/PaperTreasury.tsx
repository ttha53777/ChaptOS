"use client";

import React, { useMemo, useState } from "react";
import { PaperIcon } from "../paper/PaperIcon";

/**
 * The paper look's two treasury instruments, drawn the way the
 * `#treasury` page of _design/Dashboard Paper Mock.html draws them: hand-built
 * SVG and CSS rather than recharts, so they take the mock's inks directly.
 * Ledger keeps its recharts versions; these render inside `.pp-only`.
 *
 * Styles: app/paper-treasury.css (`.tz-*`).
 */

const DAY = 864e5;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const dn = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const plus = (iso: string, k: number) => isoOf(dn(iso) + k);
const fmtD = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${MON[m - 1]} ${d}`; };
const dowOf = (iso: string) => DOW[new Date(dn(iso) * DAY).getUTCDay()];
const r2 = (v: number) => Math.round(v * 100) / 100;
export const m0 = (v: number) => (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
const m2 = (v: number) => (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kfmt = (v: number) => (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) % 1000 ? 1 : 0) + "k" : Math.round(Math.abs(v)));

/** One movement of money. `amount` is signed: + in, − out. */
export interface PaperEntry { date: string; amount: number; label: string }
export type PaperRange = "2w" | "1m" | "term";

interface Model {
  st: string; x0: string; end: string; span: number; lo: number; hi: number; asOf: string;
  pts: [string, number][]; fut: [string, number][];
  balAt: (iso: string) => number; projAt: (iso: string) => number;
  X: (iso: string) => number; Y: (v: number) => number;
  posted: PaperEntry[]; scheduled: PaperEntry[];
}

/**
 * The running balance, as the mock models it. Posted money dated after `asOf`
 * is pulled back onto it and scheduled money dated before it is pushed forward
 * onto it, so the solid line ends exactly on the balance the hero prints and
 * the dashed line only ever runs forward.
 */
function buildModel(opening: number, postedIn: PaperEntry[], schedIn: PaperEntry[], termStart: string, asOf: string, range: PaperRange): Model {
  const posted = postedIn.map(e => ({ ...e, date: e.date > asOf ? asOf : e.date })).sort((a, b) => a.date.localeCompare(b.date));
  const scheduled = schedIn.map(e => ({ ...e, date: e.date < asOf ? asOf : e.date })).sort((a, b) => a.date.localeCompare(b.date));
  const balAt = (iso: string) => r2(opening + posted.reduce((s, e) => (e.date <= iso ? s + e.amount : s), 0));
  const bal = balAt(asOf);
  const projAt = (iso: string) => r2(bal + scheduled.reduce((s, e) => (e.date <= iso ? s + e.amount : s), 0));

  let st = range === "2w" ? plus(asOf, -14) : range === "1m" ? plus(asOf, -30) : termStart;
  if (st < termStart) st = termStart;
  if (st > asOf) st = asOf;
  const lastSched = scheduled.length ? scheduled[scheduled.length - 1].date : null;
  let end = range === "term" ? plus(lastSched && lastSched > asOf ? lastSched : asOf, 4) : plus(asOf, range === "2w" ? 8 : 18);
  const x0 = plus(st, -2);
  if (dn(end) - dn(x0) < 21) end = plus(x0, 21);
  const span = dn(end) - dn(x0);

  const pts: [string, number][] = [[st, balAt(plus(st, -1))]];
  [...new Set(posted.filter(e => e.date >= st && e.date <= asOf).map(e => e.date))].sort().forEach(d => pts.push([d, balAt(d)]));
  const fut: [string, number][] = [[asOf, bal]];
  [...new Set(scheduled.filter(e => e.date <= end).map(e => e.date))].sort().forEach(d => { if (d > asOf) fut.push([d, projAt(d)]); else fut[0] = [asOf, projAt(asOf)]; });
  // A scheduled entry clamped onto asOf would bend the solid line's end; start
  // the dashed run from the real balance and drop to it on the next step instead.
  if (fut[0][1] !== bal) fut.splice(0, 1, [asOf, bal], [plus(asOf, 1), fut[0][1]]);

  const vals = [...pts, ...fut].map(p => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.18, 400);
  // Never pad the axis below zero for a balance that never went there — a
  // "−$1.5k" gridline on a chapter that was never in the red reads as debt.
  const floor0 = lo >= 0;
  lo = Math.floor((lo - pad) / 500) * 500; hi = Math.ceil((hi + pad) / 500) * 500;
  if (floor0 && lo < 0) lo = 0;
  const X = (iso: string) => ((dn(iso) - dn(x0)) / span) * 1000;
  const Y = (v: number) => 200 - ((v - lo) / (hi - lo)) * 200;
  return { st, x0, end, span, lo, hi, asOf, pts, fut, balAt, projAt, X, Y, posted, scheduled };
}

/** Delta pill + scheduled projection + the step line. */
export function PaperBalanceChart({
  opening, posted, scheduled, termStart, asOf, isToday, range, ghost, onScheduled,
}: {
  opening: number;
  posted: PaperEntry[];
  scheduled: PaperEntry[];
  /** First day of the term on screen. */
  termStart: string;
  /** Where the solid line ends: today, or the term's last day for a past term. */
  asOf: string;
  isToday: boolean;
  range: PaperRange;
  /** Books open, nothing moved: a flat dashed line, no claims. */
  ghost?: boolean;
  onScheduled?: () => void;
}) {
  const c = useMemo(() => buildModel(opening, posted, scheduled, termStart, asOf, range), [opening, posted, scheduled, termStart, asOf, range]);
  const [hover, setHover] = useState<string | null>(null);

  if (ghost) {
    return (
      <>
        <div className="tz-delta">
          <span className="tz-pill">Opening balance{termStart ? ` · ${fmtD(termStart)}` : ""}</span>
          <span>Nothing has moved yet.</span>
        </div>
        <div className="tz-chart is-ghost">
          <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path className="ghost" d="M0 100 H1000" /></svg>
          <span className="tz-ghostcap">The line starts with your first entry</span>
        </div>
      </>
    );
  }

  const { X, Y } = c;
  const bal = c.balAt(c.asOf);
  const delta = r2(bal - c.balAt(plus(c.st, -1)));
  const step = (arr: [string, number][]) => arr.map((p, i) => (i ? `H${X(p[0]).toFixed(1)} V${Y(p[1]).toFixed(1)}` : `M${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`)).join(" ");
  const line = `${step(c.pts)} H${X(c.asOf).toFixed(1)}`;
  const area = `${line} V200 H${X(c.st).toFixed(1)} Z`;
  const hasFut = c.fut.length > 1;
  const fut = hasFut ? `${step(c.fut)} H${X(c.end).toFixed(1)}` : "";
  const grid = [0, 0.5, 1].map(k => c.lo + (c.hi - c.lo) * k);
  const months: string[] = [];
  { const d = new Date(dn(c.x0) * DAY); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    while (isoOf(Math.round(d.getTime() / DAY)) <= c.end) { months.push(isoOf(Math.round(d.getTime() / DAY))); d.setUTCMonth(d.getUTCMonth() + 1); } }
  const tx = X(c.asOf) / 10, ty = Y(bal) / 2;
  const lf = c.fut[c.fut.length - 1];
  const lastSched = c.scheduled.length ? c.scheduled[c.scheduled.length - 1] : null;

  function scrub(e: React.PointerEvent<HTMLDivElement>) {
    const plot = e.currentTarget.querySelector(".plot");
    if (!plot) return;
    const r = plot.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    let iso = plus(c.x0, Math.round(f * c.span));
    if (iso < c.st) iso = c.st;
    setHover(iso);
  }

  let hv: React.ReactNode = null;
  if (hover) {
    const isFut = hover > c.asOf;
    const v = isFut ? c.projAt(hover) : c.balAt(hover);
    const x = X(hover) / 10, y = Y(v) / 2;
    const ents = (isFut ? c.scheduled : c.posted).filter(e => e.date === hover);
    hv = (
      <>
        <span className="tz-cross" style={{ left: `${x}%` }}><i style={{ top: `${y}%` }} /></span>
        <div className={`tz-tip${x > 58 ? " flip" : ""}`} style={{ left: `${x}%` }}>
          <span className="d">{dowOf(hover)} · {fmtD(hover)}</span>
          <b>{m2(v)}</b>
          {ents.slice(0, 3).map((e, i) => (
            <span key={i} className="e">
              <span>{e.label.length > 26 ? `${e.label.slice(0, 25)}…` : e.label}</span>
              <span className={e.amount >= 0 ? "in" : "out"}>{e.amount >= 0 ? "+" : "−"}{m0(Math.abs(e.amount))}</span>
            </span>
          ))}
          {ents.length > 3 && <span className="e"><span>+{ents.length - 3} more</span><span /></span>}
          {isFut && <span className="fut">Projected · scheduled entries</span>}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="tz-delta">
        <span className={`tz-pill ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "▲" : "▼"} {m0(Math.abs(delta))} since {fmtD(c.st)}</span>
        {lastSched && (
          <button type="button" className="tz-proj" onClick={onScheduled}>
            <PaperIcon name="clock" />{c.scheduled.length} scheduled → <b>{m0(c.projAt(c.end))}</b> by {fmtD(lastSched.date)}
          </button>
        )}
      </div>
      <div
        className={`tz-chart${hover ? " on" : ""}`}
        role="img"
        aria-label={`Running balance from ${fmtD(c.st)} to ${fmtD(c.asOf)}, ${m0(bal)} ${isToday ? "today" : "at the close"}`}
        onPointerMove={scrub}
        onPointerDown={scrub}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
          <g className="grid">{grid.map(v => <line key={v} x1="0" x2="1000" y1={Y(v)} y2={Y(v)} />)}</g>
          <path className="fl" d={area} />
          {hasFut && <path className="fu" d={fut} />}
          <path className="ln" pathLength={1} d={line} />
        </svg>
        {grid.map(v => <span key={v} className="yl" style={{ top: `calc((100% - 22px) * ${(Y(v) / 200).toFixed(3)})` }}>{kfmt(v)}</span>)}
        {/* On a phone the day is dropped, and past six months every other label. */}
        {months.map((m, i) => (
          <span key={m} className={`xl${i % 2 && months.length > 6 ? " odd" : ""}`} style={{ left: `calc(46px + (100% - 46px) * ${(X(m) / 1000).toFixed(3)})` }}>
            {fmtD(m).split(" ")[0]}<span className="dd"> 1</span>
          </span>
        ))}
        <div className="plot">
          <span className="tz-today" style={{ left: `${tx}%` }} />
          {hasFut && <>
            <span className="tz-dot end" style={{ left: `${X(lf[0]) / 10}%`, top: `${Y(lf[1]) / 2}%` }} />
            <span className="tz-flag end" style={{ left: `${X(lf[0]) / 10}%`, top: `${Y(lf[1]) / 2}%` }}>{m0(lf[1])} after {fmtD(lf[0])}</span>
          </>}
          <span className="tz-dot" style={{ left: `${tx}%`, top: `${ty}%` }} />
          <span className={`tz-flag${tx > 80 ? " r" : tx < 12 ? " l" : ""}`} style={{ left: `${tx}%`, top: `${ty}%` }}>{isToday ? "Today" : `Closed ${fmtD(c.asOf)}`} · {m0(bal)}</span>
          {hv}
        </div>
      </div>
    </>
  );
}

/**
 * A category's own stored color, lifted to a pastel of the same hue so it sits
 * on paper (the stored hexes are the dusk ledger's inks). `--tz-cl/--tz-cc` are
 * set per theme in paper-treasury.css.
 */
const lift = (c: string) => `oklch(from ${c} var(--tz-cl) calc(c * var(--tz-cc)) h)`;
const RAMP = ["var(--pp-mint)", "var(--pp-peach)", "var(--pp-sky)", "var(--pp-butter)", "var(--pp-lilac)", "var(--pp-rose)"];

export interface PaperCat { slug: string; label: string; value: number; color: string | null }

/** "Where it went" / "Where it came from": inked conic ring + one row per category. */
export function PaperBreakdown({
  kind, rows, ready, ghost, onPick,
}: {
  kind: "income" | "expense";
  /** Every category with money in it this term, biggest first. */
  rows: PaperCat[];
  /** The org's configured categories, named on the uncharged ring. */
  ready: { slug: string; label: string; color: string | null }[];
  /** Books open, nothing moved anywhere — not just nothing on this side. */
  ghost?: boolean;
  onPick?: (slug: string) => void;
}) {
  const word = kind === "income" ? "came in" : "went out";
  const total = rows.reduce((s, r) => s + r.value, 0);
  const col = (r: { color: string | null }, i: number) => r.color ?? RAMP[i % RAMP.length];

  if (ghost || rows.length === 0 || total <= 0) {
    return (
      <>
        <div className="tz-donut">
          <div className="tz-ring ghost"><div className="tz-ring-c"><div><b>—</b><small>{kind === "income" ? "in" : "out"}</small></div></div></div>
          <p className="lede">
            {ghost
              ? <>Fills in once money moves — there’s no split to show yet.{ready.length > 0 && " Your categories are ready:"}</>
              : <>Nothing {kind === "income" ? "has come in" : "has gone out"} this term yet.{ready.length > 0 && " It’ll split across:"}</>}
          </p>
        </div>
        {ready.length > 0 && (
          <div className="tz-ready">
            {ready.map((c, i) => (
              <span key={c.slug} className="tz-cpill" style={{ "--cc-raw": col(c, i), "--cc": c.color ? lift(c.color) : col(c, i) } as React.CSSProperties}>{c.label}</span>
            ))}
          </div>
        )}
      </>
    );
  }

  let acc = 0;
  const stops = (f: (r: PaperCat, i: number) => string) => {
    acc = 0;
    return rows.map((r, i) => {
      const a = acc, b = acc + (r.value / total) * 100; acc = b;
      const seam = Math.max(a, b - (rows.length > 1 ? 0.7 : 0));
      return `${f(r, i)} ${a.toFixed(2)}% ${seam.toFixed(2)}%, var(--ink) ${seam.toFixed(2)}% ${b.toFixed(2)}%`;
    }).join(", ");
  };
  const gRaw = `conic-gradient(${stops(col)})`;
  const g = `conic-gradient(${stops((r, i) => (r.color ? lift(r.color) : col(r, i)))})`;
  const top = rows[0];

  return (
    <>
      <div className="tz-donut">
        <div className="tz-ring" style={{ "--g-raw": gRaw, "--g": g } as React.CSSProperties}>
          <div className="tz-ring-c"><div><b>{m0(total)}</b><small>{word}</small></div></div>
        </div>
        <p className="lede">
          {rows.length === 1
            ? <>All of it is <b>{top.label}</b> so far — {m0(top.value)}.</>
            : <><b>{top.label}</b> is the biggest — {m0(top.value)}, {Math.round((top.value / total) * 100)}% of everything that {word}.</>}
        </p>
      </div>
      <div className="tz-cats">
        {rows.map((r, i) => {
          const p = (r.value / total) * 100;
          return (
            <button
              key={r.slug}
              type="button"
              className="tz-cat"
              title={`See ${r.label} entries`}
              onClick={() => onPick?.(r.slug)}
              style={{ "--cc-raw": col(r, i), "--cc": r.color ? lift(r.color) : col(r, i) } as React.CSSProperties}
            >
              <span className="sw" />
              <span className="nm">{r.label}<PaperIcon name="arrow-r" /></span>
              <span className="v">{m0(r.value)}<small>{Math.round(p)}%</small></span>
              <span className="bar"><i style={{ width: `${p}%` }} /></span>
            </button>
          );
        })}
      </div>
    </>
  );
}
