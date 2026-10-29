"use client";

// Answer shapes — the picture an answer is drawn as when a list isn't it
// (_design/Ask Chapt Reply States.html §02 Tally, §03 Breakdown, §05 Week).
// Every number here came from the server (lib/ai-shapes), never model text.
//
// Each shape draws over the answer's own `rows`, which the server derived from
// the same data: Tally shows them as its "biggest few" list, and Breakdown and
// Week bind each bar / calendar block to the row at the same index. That keeps
// keyboard selection (stepRow over `rows`) pointing at what's on screen, and a
// tap doing exactly what tapping the plain row would.

import { useState, type CSSProperties } from "react";

import { fmtUsd } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { paperCatVars } from "@/lib/event-hue";
import { IcArrow, IcChev, KindGlyph } from "./icons";
import { rowAction, type AnswerRow, type AnswerShape, type BreakdownShape, type MissingShape, type TallyMark, type TallyShape, type WeekItem, type WeekShape } from "./types";

export interface RowHandlers {
  /** Index of the keyboard-selected row, or -1. */
  selectedRow: number;
  act: (row: AnswerRow) => void;
  onPeek: (row: AnswerRow) => void;
}

/** True when this client knows how to draw the shape; unknown types fall back to rows. */
export function isKnownShape(shape: AnswerShape | undefined): shape is AnswerShape {
  return !!shape && (shape.type === "tally" || shape.type === "breakdown" || shape.type === "week" || shape.type === "missing");
}

/**
 * Paper's pastel family for the categories the mock names; any other colour is
 * mixed from the org's own hex (lib/event-hue.ts, shared with the Timeline's
 * catStyleOf), so an event reads the same colour here as on its spine.
 */
const FALLBACK_CAT_COLOR = "#8a8170";

function catVars(slug: string | null, color: string | null, colorDark: string | null): CSSProperties {
  const c = colorDark ?? color ?? FALLBACK_CAT_COLOR;
  return { ["--catc" as string]: c, ...paperCatVars(slug, c) } as CSSProperties;
}

const personRow = (m: TallyMark): AnswerRow =>
  ({ kind: "person", title: m.name, ...(m.value ? { value: m.value } : {}), ref: { type: "member", id: m.id } });

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "·";
}

// ─── Tally ──────────────────────────────────────────────────────────────────

function TallySheet({ shape, rows, h, renderRow }: {
  shape: TallyShape;
  rows: AnswerRow[];
  h: RowHandlers;
  renderRow: (row: AnswerRow, i: number) => React.ReactNode;
}) {
  const [tip, setTip] = useState<{ m: TallyMark; x: number; y: number } | null>(null);
  const [more, setMore] = useState(false);
  const marks = shape.marks;
  // Everyone the list above doesn't already show, still in rank order.
  const listed = new Set(rows.map(r => r.ref?.id));
  const extra = (marks ?? []).filter(m => m.state !== "rest" && !listed.has(m.id));
  const cols = Math.max(1, Math.min(26, shape.of));
  const colsSm = Math.max(1, Math.min(13, shape.of));

  const showTip = (m: TallyMark, el: HTMLElement) => {
    const dots = el.parentElement!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setTip({ m, x: r.left - dots.left + r.width / 2, y: r.top - dots.top });
  };

  return (
    <div className="shp shp-tally in in-3">
      <div className="shp-h">
        <div className="tl-n">{shape.hit}<span> / {shape.of} {shape.hitWord}</span></div>
        <div className="shp-legend">
          {shape.topLabel && <span><i className="k-top" />{shape.topLabel}</span>}
          <span><i className="k-hit" />{shape.hitLegend}</span>
          <span><i className="k-rest" />{shape.restLegend}</span>
        </div>
      </div>

      {marks ? (
        <div
          className="tl-dots"
          style={{ ["--cols" as string]: cols, ["--cols-sm" as string]: colsSm } as CSSProperties}
          onMouseLeave={() => setTip(null)}
        >
          {marks.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`tl-dot ${m.state}`}
              style={{ ["--i" as string]: i } as CSSProperties}
              aria-label={`${m.name}${m.value ? `, ${m.value}` : m.state === "rest" ? `, ${shape.restLegend.toLowerCase()}` : ""}`}
              onMouseEnter={e => showTip(m, e.currentTarget)}
              onFocus={e => showTip(m, e.currentTarget)}
              onBlur={() => setTip(null)}
              onClick={() => h.onPeek(personRow(m))}
            />
          ))}
          {tip && (
            <span className="tl-tip" style={{ left: tip.x, top: tip.y }} aria-hidden>
              {tip.m.name}<b>{tip.m.value ?? (tip.m.state === "rest" ? shape.restLegend.toLowerCase() : shape.hitLegend.toLowerCase())}</b>
            </span>
          )}
        </div>
      ) : (
        // Too many people to count as dots — the proportion is the point.
        <div className="tl-bar" role="img" aria-label={`${shape.hit} of ${shape.of} ${shape.hitWord}`}>
          <b style={{ width: `${shape.of ? (shape.hit / shape.of) * 100 : 0}%` }} />
        </div>
      )}

      {rows.length > 0 && <div className="reslist">{rows.map(renderRow)}</div>}

      {extra.length > 0 && (
        <>
          {more && (
            <div className="tl-more">
              {extra.map(m => (
                <button key={m.id} type="button" className="tl-chip" onClick={() => h.onPeek(personRow(m))}>
                  <span className="av">{initials(m.name)}</span>{m.name}{m.value && <b>{m.value}</b>}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="tl-more-btn" aria-expanded={more} onClick={() => setMore(v => !v)}>
            {more ? "Show fewer" : `+ ${extra.length} more ${extra.length === 1 && shape.metric === "owes_dues" ? "who owes" : shape.metric === "owes_dues" ? "who owe" : shape.hitWord}`}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Breakdown ──────────────────────────────────────────────────────────────

function BreakdownSheet({ shape, rows, h }: { shape: BreakdownShape; rows: AnswerRow[]; h: RowHandlers }) {
  // Bars share one scale — the biggest of any spend or budget — so a budget
  // tick past its bar is visibly room left, and an overhang is visibly over.
  const max = Math.max(...shape.parts.map(p => Math.max(p.amount, p.budget ?? 0)), 1);
  const pct = (n: number) => `${((n / max) * 100).toFixed(2)}%`;
  return (
    <div className="shp shp-brk in in-3">
      <div className="shp-h">
        <span className="shp-kicker">{shape.period}</span>
        {shape.hasBudget && (
          <div className="shp-legend">
            <span><i className="k-bud" />Budget</span>
            <span><i className="k-over" />Over</span>
          </div>
        )}
      </div>
      <div className="bk-rib" aria-hidden>
        {shape.parts.map((p, i) => (
          <b key={p.slug ?? `other-${i}`} style={{ ...catVars(p.slug, p.color, p.colorDark), ["--w" as string]: `${p.share}%`, ["--i" as string]: i } as CSSProperties} />
        ))}
      </div>
      <div className="bk-rows">
        {shape.parts.map((p, i) => {
          const row = rows[i];
          const over = p.budget != null && p.amount > p.budget;
          const action = row ? rowAction(row) : null;
          return (
            <button
              key={p.slug ?? `other-${i}`}
              type="button"
              className={`bk-r${i === 0 ? " lead" : ""}${i === h.selectedRow ? " sel" : ""}`}
              style={{ ...catVars(p.slug, p.color, p.colorDark), ["--i" as string]: i } as CSSProperties}
              disabled={!action}
              onClick={() => row && h.act(row)}
            >
              <span className="nm"><i /><span>{p.label}</span></span>
              <span className="trk" style={{ ["--w" as string]: pct(p.amount), ...(p.budget != null ? { ["--b" as string]: pct(p.budget) } : {}) } as CSSProperties}>
                <span className="fill" />
                {over && <span className="over" />}
                {p.budget != null && <span className="bud" title={`Budget ${fmtUsd(p.budget)}`} />}
              </span>
              <span className="amt">
                {fmtUsd(p.amount)}
                {p.budget != null
                  ? over ? <small className="ov">{fmtUsd(p.amount - p.budget)} over</small> : <small>of {fmtUsd(p.budget)}</small>
                  : shape.hasBudget ? <small>no budget</small> : null}
              </span>
              <span className="pct">{p.share}%</span>
              <span className="chev">{action === "nav" ? <IcArrow /> : action ? <IcChev /> : null}</span>
            </button>
          );
        })}
      </div>
      <div className="bk-foot">
        <span>{shape.kind === "income" ? "Total earned" : "Total spent"}</span>
        <b>{fmtUsd(shape.total)}</b>
      </div>
    </div>
  );
}

// ─── Week ───────────────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function WeekSheet({ shape, rows, h }: { shape: WeekShape; rows: AnswerRow[]; h: RowHandlers }) {
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(shape.start, i));
  // Items keep their index so each block binds to its row (selection + action).
  const byDay = new Map<string, Array<{ it: WeekItem; i: number }>>();
  shape.items.forEach((it, i) => {
    const list = byDay.get(it.date) ?? [];
    list.push({ it, i });
    byDay.set(it.date, list);
  });
  let order = 0;
  return (
    <div className="shp shp-wk in in-3">
      {days.map(day => {
        const [y, m, d] = day.split("-").map(Number);
        const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
        const isToday = day === today;
        const items = byDay.get(day) ?? [];
        return (
          <div key={day} className={`wd${isToday ? " today" : ""}${day < today ? " past" : ""}`}>
            <div className="wd-h">
              <span className="dw">{dow}{isToday ? " · today" : ""}</span>
              <span className="dn">{d}</span>
            </div>
            <div className="wd-b">
              {items.length === 0 && <span className="wd-none">—</span>}
              {items.map(({ it, i }) => {
                const row = rows[i];
                return (
                  <button
                    key={`${it.ref.type}-${it.ref.id}`}
                    type="button"
                    className={`wk-ev${it.kind === "deadline" ? " dl" : ""}${i === h.selectedRow ? " sel" : ""}`}
                    style={{ ...(it.cat ? catVars(it.cat.slug, it.cat.color, it.cat.colorDark) : {}), ["--i" as string]: order++ } as CSSProperties}
                    disabled={!row || !rowAction(row)}
                    onClick={() => row && h.act(row)}
                  >
                    <b>{it.title}</b>
                    <span className="tm">{it.kind === "deadline" ? `⚑ ${it.time ?? "Due"}` : it.time ?? it.cat?.label ?? ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Not found ──────────────────────────────────────────────────────────────

/** The glyph each searched place gets — the screen it lives on. */
const LOOK_GLYPH: Record<MissingShape["looked"][number]["source"], string> = {
  events: "timeline", service: "service", programming: "programming", deadlines: "tasks", docs: "docs",
};

function MissingSheet({ shape, rows, renderRow }: {
  shape: MissingShape;
  rows: AnswerRow[];
  renderRow: (row: AnswerRow, i: number) => React.ReactNode;
}) {
  return (
    <>
      <div className="shp shp-miss in in-3">
        <div className="shp-h"><span className="shp-kicker">Where I looked</span></div>
        <span className="nomatch" aria-hidden>No match</span>
        <div className="looked">
          {shape.looked.map((l, i) => (
            <div key={l.source} className="lk" style={{ ["--i" as string]: i } as CSSProperties}>
              <span className="g"><KindGlyph kind={LOOK_GLYPH[l.source]} size={12} /></span>
              <span className="w">{l.label}<small>{l.scope}</small></span>
              <span className="z">0 of {l.of}</span>
            </div>
          ))}
        </div>
      </div>
      {rows.length > 0 && (
        <div className="closest in in-3">
          <span className="shp-kicker">Closest I found</span>
          <div className="reslist">{rows.map(renderRow)}</div>
        </div>
      )}
    </>
  );
}

export function ShapeBlock({ shape, rows, h, renderRow }: {
  shape: AnswerShape;
  rows: AnswerRow[];
  h: RowHandlers;
  renderRow: (row: AnswerRow, i: number) => React.ReactNode;
}) {
  if (shape.type === "tally") return <TallySheet shape={shape} rows={rows} h={h} renderRow={renderRow} />;
  if (shape.type === "breakdown") return <BreakdownSheet shape={shape} rows={rows} h={h} />;
  if (shape.type === "missing") return <MissingSheet shape={shape} rows={rows} renderRow={renderRow} />;
  return <WeekSheet shape={shape} rows={rows} h={h} />;
}
