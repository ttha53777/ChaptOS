"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * SheetGrid — a generic, column-driven spreadsheet shell.
 *
 * Renders Airtable/Notion-style database chrome (header chips with column-type
 * icons, dense bordered cells, sticky header + first column) in the app's dark
 * palette. Pages supply a `columns` config and `rows`; cell behavior is declared
 * per column via a `kind` + accessor/patch callbacks. Group bands (e.g. months)
 * are passed as ordered sections so the grid can render spanning header rows.
 *
 * This is the shared primitive behind matrix-style pages (Programming today,
 * Service / Parties later). Keep it page-agnostic — anything domain-specific
 * lives in the caller's column config.
 */

export type ColumnKind =
  | "text"
  | "date"
  | "time"
  | "currency"
  | "select"
  | "checkbox"
  | "link"
  | "rating"
  | "badge"
  | "custom";

export interface SheetColumn<Row> {
  /** Stable key, also used for React keys. */
  key: string;
  /** Header label. */
  label: string;
  /** Drives the header icon and default cell rendering. */
  kind: ColumnKind;
  /** Tailwind width class, e.g. "w-48". */
  width?: string;
  /** Center the cell + header contents (checkboxes, links, ratings). */
  align?: "left" | "center";
  /** Mark the column as the accent/"active" column (tinted header chip). */
  accent?: boolean;
  /** Render the cell. Receives the row and the shared edit-permission flag. */
  render: (row: Row, canManage: boolean) => React.ReactNode;
}

export interface SheetSection<Row> {
  /** Stable key for the section (e.g. a month key "2026-08"). */
  key: string;
  /** Band label spanning the row, e.g. "August 2026". */
  label: string;
  rows: Row[];
}

export function SheetGrid<Row extends { id: number }>({
  title,
  badge,
  columns,
  sections,
  canManage,
  selectedId,
  minWidthClass = "min-w-[1220px]",
  emptyLabel = "No rows yet.",
  onSelectRow,
}: {
  title: string;
  badge?: string;
  columns: SheetColumn<Row>[];
  sections: SheetSection<Row>[];
  canManage: boolean;
  selectedId?: number | null;
  minWidthClass?: string;
  emptyLabel?: string;
  onSelectRow?: (id: number) => void;
}) {
  const totalCols = columns.length + 1; // + leading row-number column

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0c12] shadow-[0_24px_70px_-46px_rgba(0,0,0,0.95)] ring-1 ring-inset ring-white/[0.02]">
      <div className="flex h-9 items-center gap-2 border-b border-white/[0.06] bg-gradient-to-b from-[#161a26] to-[#12151f] px-3.5">
        <div className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/25">
          <div className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
        </div>
        <p className="text-[11.5px] font-semibold tracking-tight text-slate-200">{title}</p>
        {badge && (
          <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-white/[0.04]">{badge}</span>
        )}
      </div>

      <div className="max-h-[calc(100vh-190px)] overflow-auto">
        <table className={`w-full ${minWidthClass} border-separate border-spacing-0 text-left text-[12px]`}>
          <thead className="sticky top-0 z-10">
            <tr>
              <HeaderChip sticky className="w-10 border-r border-white/[0.06] text-center" align="center" label="#" />
              {columns.map(col => (
                <HeaderChip
                  key={col.key}
                  className={col.width}
                  align={col.align ?? "left"}
                  accent={col.accent}
                  kind={col.kind}
                  label={col.label}
                />
              ))}
            </tr>
          </thead>

          <tbody>
            {sections.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="border-b border-white/[0.06] py-16 text-center text-slate-500">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              sections.map(section => (
                <React.Fragment key={section.key}>
                  <tr>
                    <td className="sticky left-0 z-[1] border-r border-b border-white/[0.06] bg-[#0d1018] px-2 py-2" aria-hidden />
                    <td
                      colSpan={columns.length}
                      className="border-b border-white/[0.06] bg-[#0d1018] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-0.5 rounded-full bg-indigo-400/70" />
                        {section.label}
                      </span>
                    </td>
                  </tr>
                  {section.rows.map((row, i) => (
                    <SheetRow
                      key={row.id}
                      row={row}
                      rowNumber={i + 1}
                      columns={columns}
                      canManage={canManage}
                      selected={selectedId === row.id}
                      onSelect={onSelectRow}
                    />
                  ))}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const HEADER_BASE =
  "border-b border-white/[0.07] bg-[#11141d] px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500";

function HeaderChip({
  label,
  kind,
  width,
  className,
  align = "left",
  accent,
  sticky,
}: {
  label: string;
  kind?: ColumnKind;
  width?: string;
  className?: string;
  align?: "left" | "center";
  accent?: boolean;
  sticky?: boolean;
}) {
  return (
    <th
      className={[
        HEADER_BASE,
        width,
        className,
        sticky ? "sticky left-0 z-20" : "",
        accent ? "text-slate-400" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={`flex items-center gap-1.5 ${align === "center" ? "justify-center" : ""}`}>
        {kind && <ColumnIcon kind={kind} accent={accent} />}
        <span className="truncate">{label}</span>
      </span>
    </th>
  );
}

const CELL = "border-b border-white/[0.05] px-2.5 py-2 align-middle";

function SheetRow<Row extends { id: number }>({
  row,
  rowNumber,
  columns,
  canManage,
  selected,
  onSelect,
}: {
  row: Row;
  rowNumber: number;
  columns: SheetColumn<Row>[];
  canManage: boolean;
  selected: boolean;
  onSelect?: (id: number) => void;
}) {
  return (
    <tr
      onClick={() => onSelect?.(row.id)}
      className={`group transition-colors ${onSelect ? "cursor-pointer" : ""} ${
        selected
          ? "bg-indigo-500/[0.09]"
          : "bg-[#0a0c12] hover:bg-white/[0.02]"
      }`}
    >
      <td
        className={`${CELL} sticky left-0 z-[1] w-10 border-r border-white/[0.06] bg-inherit text-center text-[10px] tabular-nums ${
          selected ? "font-semibold text-indigo-300" : "text-slate-700 group-hover:text-slate-500"
        }`}
      >
        {selected ? (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400" />
        ) : (
          rowNumber
        )}
      </td>
      {columns.map(col => (
        <td
          key={col.key}
          className={`${CELL} ${col.align === "center" ? "text-center" : ""}`}
          onClick={ev => ev.stopPropagation()}
        >
          {col.render(row, canManage)}
        </td>
      ))}
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Column-type icons — make headers read like a real database.        */
/* ------------------------------------------------------------------ */

function ColumnIcon({ kind, accent }: { kind: ColumnKind; accent?: boolean }) {
  const cls = `h-3 w-3 shrink-0 ${accent ? "text-indigo-300" : "text-slate-500"}`;

  switch (kind) {
    case "text":
      return (
        <span className={`text-[10px] font-bold leading-none ${accent ? "text-indigo-300" : "text-slate-500"}`}>
          T<span className="text-[7px]">T</span>
        </span>
      );
    case "date":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path strokeLinecap="round" d="M3 9h18M8 2v4M16 2v4" />
        </svg>
      );
    case "time":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 7v5l3 2" />
        </svg>
      );
    case "currency":
      return (
        <span className={`text-[11px] font-bold leading-none ${accent ? "text-indigo-300" : "text-slate-500"}`}>$</span>
      );
    case "select":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h6" />
        </svg>
      );
    case "checkbox":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12l3 3 5-6" />
        </svg>
      );
    case "link":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 4h5v5M19 4l-9 9M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" />
        </svg>
      );
    case "rating":
      return <span className={`text-[11px] leading-none ${accent ? "text-indigo-300" : "text-slate-500"}`}>★</span>;
    case "badge":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M3 7a4 4 0 014-4h6l8 8-7 7-8-8V7z" />
        </svg>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Reusable cell editors — used by column configs.                    */
/* ------------------------------------------------------------------ */

const SHEET_INPUT =
  "h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[12px] text-slate-200 outline-none transition-colors hover:border-white/[0.07] hover:bg-white/[0.02] focus:border-indigo-500/40 focus:bg-indigo-500/[0.07] focus:ring-1 focus:ring-inset focus:ring-indigo-500/30";

/** Text/number cell that commits on blur or Enter, reverting empty required values. */
export function SheetTextCell({
  value,
  display,
  canManage,
  placeholder,
  type = "text",
  className = "",
  required,
  onCommit,
}: {
  value: string;
  display?: React.ReactNode;
  canManage: boolean;
  placeholder?: string;
  type?: "text" | "date" | "number";
  className?: string;
  required?: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const initial = useRef(value);

  useEffect(() => {
    setDraft(value);
    initial.current = value;
  }, [value]);

  if (!canManage) {
    return <span className="text-slate-400">{display ?? value ?? "—"}</span>;
  }

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      className={`${SHEET_INPUT} ${className}`}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const next = type === "number" ? draft : draft.trim();
        if (required && !next) {
          setDraft(initial.current);
          return;
        }
        if (next !== initial.current) onCommit(next);
      }}
      onKeyDown={e => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(initial.current);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function SheetCheckboxCell({
  checked,
  canManage,
  onChange,
}: {
  checked: boolean;
  canManage: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={!canManage}
      onChange={e => onChange(e.target.checked)}
      className="h-3.5 w-3.5 accent-indigo-500"
    />
  );
}

export function SheetLinkCell({
  url,
  canManage,
  label = "File",
  onAdd,
}: {
  url?: string | null;
  canManage: boolean;
  label?: string;
  onAdd?: () => void;
}) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-indigo-300 hover:bg-indigo-500/10"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h2M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
        </svg>
        {label}
      </a>
    );
  }
  if (canManage && onAdd) {
    return (
      <button onClick={onAdd} className="text-[10px] text-slate-500 hover:text-indigo-400">
        Add
      </button>
    );
  }
  return <span className="text-slate-600">—</span>;
}
