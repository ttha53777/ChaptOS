"use client";

// Pieces every answer sheet shares: the row handlers a sheet binds its marks to,
// the category colour vars, the date stub every dated row wears, the one-line
// fold, the kicker + legend header, and relative-date labels computed from the
// shape's own `today` snapshot (so an answer reopened tomorrow from storage
// still reads the way it did when it was given).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { paperCatVars } from "@/lib/event-hue";
import { IcArrow, IcChev, IcPlus, IcSpark } from "../icons";
import { rowAction, type AnswerRow, type RowAction } from "../types";

export interface RowHandlers {
  /** Index of the keyboard-selected row, or -1. */
  selectedRow: number;
  act: (row: AnswerRow) => void;
  onPeek: (row: AnswerRow) => void;
}

export type RenderRow = (row: AnswerRow, i: number) => ReactNode;

/**
 * Paper's pastel family for the categories the mock names; any other colour is
 * mixed from the org's own hex (lib/event-hue.ts, shared with the Timeline's
 * catStyleOf), so an event reads the same colour here as on its spine.
 */
const FALLBACK_CAT_COLOR = "#8a8170";

export function catVars(slug: string | null, color: string | null, colorDark: string | null): CSSProperties {
  const c = colorDark ?? color ?? FALLBACK_CAT_COLOR;
  return { ["--catc" as string]: c, ...paperCatVars(slug, c) } as CSSProperties;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "·";
}

/** A stagger index as a style var. */
export const iv = (i: number): CSSProperties => ({ ["--i" as string]: i } as CSSProperties);

// ─── Dates ──────────────────────────────────────────────────────────────────

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const monShort = (iso: string) => MON[parts(iso)[1] - 1];
export const monthName = (iso: string) => MONTH[parts(iso)[1] - 1];
export const dayNum = (iso: string) => parts(iso)[2];
export const yearOf = (iso: string) => parts(iso)[0];
export function dowShort(iso: string): string {
  const [y, m, d] = parts(iso);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
/** "Nov 4". */
export function fmtDay(iso: string): string {
  const m = MONTH[parts(iso)[1] - 1].slice(0, 3);
  return `${m} ${parts(iso)[2]}`;
}

/** "6 days late" / "today" / "in 2 days" — for things that are due. */
export function dueLabel(today: string, date: string, late: boolean): string {
  const n = daysBetween(today, date);
  if (n === 0) return "today";
  if (n > 0) return n === 1 ? "tomorrow" : `in ${n} days`;
  if (late) return n === -1 ? "1 day late" : `${-n} days late`;
  return n === -1 ? "yesterday" : `${-n} days ago`;
}

// ─── Shared marks ───────────────────────────────────────────────────────────

/** A calendar-page stub: month over day. `tone` picks the band colour. */
export function DateStub({ date, tone, small }: { date: string; tone?: "late" | "now" | "week" | "was" | "plain"; small?: boolean }) {
  return (
    <span className={`shp-stub${tone ? ` ${tone}` : ""}${small ? " sm" : ""}`} aria-hidden>
      <b>{monShort(date)}</b>
      <i>{dayNum(date)}</i>
    </span>
  );
}

/** The affordance a row shows for what tapping it does; nothing for an inert row. */
export function Affordance({ action, className = "chev" }: { action: RowAction | null; className?: string }) {
  if (!action) return <span className={className} />;
  return (
    <span className={`${className}${action === "ask" ? " ask" : ""}${action === "idea" ? " plus" : ""}`}>
      {action === "peek" && <IcChev />}
      {action === "idea" && <IcPlus />}
      {action === "nav" && <IcArrow />}
      {action === "ask" && <IcSpark size={14} />}
    </span>
  );
}

/** Kicker on the left, legend on the right — the head of every sheet. */
export function Sheet({ kicker, legend, className = "", children }: {
  kicker?: ReactNode;
  legend?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`shp in in-3 ${className}`}>
      {(kicker || legend) && (
        <div className="shp-h">
          {kicker && <span className="shp-kicker">{kicker}</span>}
          {legend && <div className="shp-legend">{legend}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The one-line fold: what's folded, counted, with a chevron that turns when it
 * opens. Controlled, so a sheet can open it when keyboard selection lands on a
 * folded row.
 */
export function FoldLine({ open, onToggle, mark, children }: {
  open: boolean;
  onToggle: () => void;
  mark?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button type="button" className="shp-fold" aria-expanded={open} onClick={onToggle}>
      {mark && <span className="shp-fold-m">{mark}</span>}
      <span className="tx">{children}</span>
      <span className="chev"><IcChev /></span>
    </button>
  );
}

/**
 * Bind a sheet's element to keyboard selection: returns a ref to put on the
 * element drawn for rows[i] and scrolls it into view when it becomes selected.
 */
export function useSelectedScroll<T extends HTMLElement>(selected: boolean) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return ref;
}

/** Fold state that opens itself when the selection moves onto a folded row. */
export function useFold(selectedRow: number, foldedRows: number[]): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  const hit = foldedRows.includes(selectedRow);
  useEffect(() => {
    if (hit) setOpen(true);
  }, [hit]);
  return [open, () => setOpen(v => !v)];
}

/**
 * One tappable mark bound to rows[i]: the right affordance class, disabled when
 * the row has no action, selected when keyboard selection is on it.
 */
export function RowButton({ row, i, h, className, style, children, label }: {
  row: AnswerRow | undefined;
  i: number;
  h: RowHandlers;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
  label?: string;
}) {
  const action = row ? rowAction(row) : null;
  const sel = i === h.selectedRow;
  const ref = useSelectedScroll<HTMLButtonElement>(sel);
  return (
    <button
      ref={ref}
      type="button"
      className={`${className}${sel ? " sel" : ""}${action ? "" : " inert"}`}
      style={style}
      disabled={!action}
      aria-label={label}
      onClick={() => row && h.act(row)}
    >
      {children}
    </button>
  );
}
