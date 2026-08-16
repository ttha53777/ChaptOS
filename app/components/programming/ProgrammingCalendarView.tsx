"use client";

import React, { useMemo, useState } from "react";
import type { ProgrammingTask } from "../../data";
import { typeVisual, type TypeVisual } from "./typeColor";
import { todayStr } from "../../lib/dates";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TODAY = todayStr();


export function ProgrammingCalendarView({
  tasks,
  visuals,
  selectedId,
  variant = "default",
  canManage = false,
  semesterStart,
  semesterEnd,
  onSelect,
  onSetDate,
  renderRail,
}: {
  tasks: ProgrammingTask[];
  /** slug → colour/glyph from the org's own event types. */
  visuals: Map<string, TypeVisual>;
  selectedId: number | null;
  canManage?: boolean;
  /** Active semester bounds; days outside refuse the drop (the server would too). */
  semesterStart?: string | null;
  semesterEnd?: string | null;
  /** Set an event's date from a drop. Never promotes — see the drop rules. */
  onSetDate?: (id: number, date: string) => void;
  /** Rendered beside the month (dusk only) — the undated rail shares drag state. */
  renderRail?: (onDragStart: (id: number) => void) => React.ReactNode;
  /** "dusk" renders the warm-paper calendar for the redesigned events page. */
  variant?: "default" | "dusk";
  onSelect: (id: number) => void;
}) {
  // Default to the month of the soonest dated task, else current month.
  const dated = useMemo(() => tasks.filter(t => t.dueDate), [tasks]);
  const initial = dated[0]?.dueDate ?? TODAY;
  const [ym, setYm] = useState(() => initial.slice(0, 7)); // "YYYY-MM"

  const [year, month] = ym.split("-").map(Number); // month 1-12

  const byDay = useMemo(() => {
    const map = new Map<string, ProgrammingTask[]>();
    for (const t of dated) {
      if (t.dueDate!.slice(0, 7) !== ym) continue;
      const arr = map.get(t.dueDate!) ?? [];
      arr.push(t);
      map.set(t.dueDate!, arr);
    }
    return map;
  }, [dated, ym]);

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);

  const [dragId, setDragId] = useState<number | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  function shift(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYm(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  const dndOn = canManage && !!onSetDate;
  const dragTask = dragId != null ? tasks.find(t => t.id === dragId) ?? null : null;

  /**
   * Whether this day will accept the event currently being dragged.
   *
   * A Done event refuses outright — it already happened, and its date is part of
   * the record rather than a plan to be revised. Out-of-semester days refuse too,
   * because the server's semester guard would reject the write anyway and a drop
   * that silently 400s is worse than one that never highlights.
   */
  function dayAccepts(day: string): boolean {
    if (!dndOn || !dragTask) return false;
    if (dragTask.stage === "done") return false;
    if (semesterStart && day < semesterStart) return false;
    if (semesterEnd && day > semesterEnd) return false;
    return true;
  }

  function handleDrop(day: string) {
    const id = dragId;
    setDragId(null);
    setOverDay(null);
    if (id == null || !dayAccepts(day)) return;
    // Setting a date NEVER promotes. Auto-publishing here would put the event in
    // front of the whole chapter as a side effect of a drag aimed at a square.
    onSetDate?.(id, day);
  }

  if (variant === "dusk") {
    return (
      <div className="ev-cal-wrap">
      <div className="ev-cal">
        <div className="ev-cal-head">
          <p className="mo">{MONTH_NAMES[month - 1]} {year}</p>
          <div className="ev-cal-nav">
            <button onClick={() => shift(-1)} aria-label="Previous month">‹</button>
            <button onClick={() => setYm(TODAY.slice(0, 7))}>Today</button>
            <button onClick={() => shift(1)} aria-label="Next month">›</button>
          </div>
        </div>
        <div className="ev-cal-dow">
          {WEEKDAYS.map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="ev-cal-grid">
          {cells.map((day, i) => {
            const dayTasks = day ? byDay.get(day) ?? [] : [];
            const accepts = day ? dayAccepts(day) : false;
            const isOver = day != null && overDay === day;
            return (
              <div
                key={i}
                onDragOver={day && accepts ? e => { e.preventDefault(); setOverDay(day); } : undefined}
                onDragLeave={() => setOverDay(d => (d === day ? null : d))}
                onDrop={day && accepts ? () => handleDrop(day) : undefined}
                className={`ev-cal-cell${isOver && accepts ? " drop" : ""}`}
              >
                {day && (
                  <>
                    <div className={`ev-cal-dnum${day === TODAY ? " today" : ""}`}>{Number(day.slice(-2))}</div>
                    <div className="ev-cal-dots">
                      {dayTasks.map(t => (
                        <button
                          key={t.id}
                          onClick={() => onSelect(t.id)}
                          aria-label={t.title}
                          className={`ev-cal-dot${selectedId === t.id ? " sel" : ""}`}
                          style={{ background: typeVisual(visuals, t.category).hex }}
                        />
                      ))}
                    </div>
                    <div className="ev-cal-chips">
                      {dayTasks.map(t => (
                        <button
                          key={t.id}
                          draggable={dndOn}
                          onDragStart={dndOn ? () => setDragId(t.id) : undefined}
                          onClick={() => onSelect(t.id)}
                          className={`ev-cal-chip${selectedId === t.id ? " sel" : ""}${
                            t.stage === "confirmed" || t.stage === "done" ? "" : " pencil"
                          }`}
                        >
                          <span className="cdot" style={{ background: typeVisual(visuals, t.category).hex }} />
                          <span className="ct">{t.title}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {renderRail?.(setDragId)}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0c0f16]">
      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3">
        <p className="text-[13px] font-semibold text-white">{MONTH_NAMES[month - 1]} {year}</p>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className="rounded-md border border-white/[0.08] px-2 py-1 text-[12px] text-slate-300 hover:bg-white/[0.05]">‹</button>
          <button onClick={() => setYm(TODAY.slice(0, 7))} className="rounded-md border border-white/[0.08] px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/[0.05]">Today</button>
          <button onClick={() => shift(1)} className="rounded-md border border-white/[0.08] px-2 py-1 text-[12px] text-slate-300 hover:bg-white/[0.05]">›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-white/[0.05]">
        {WEEKDAYS.map(d => (
          <div key={d} className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const dayTasks = day ? byDay.get(day) ?? [] : [];
          return (
            <div key={i} className={`min-h-[58px] border-b border-r border-white/[0.04] p-1 sm:min-h-[92px] sm:p-1.5 ${i % 7 === 0 ? "border-l" : ""}`}>
              {day && (
                <>
                  <div className={`mb-1 text-[10px] tabular-nums ${day === TODAY ? "font-bold text-indigo-300" : "text-slate-500"}`}>
                    {Number(day.slice(-2))}
                  </div>
                  {/* Mobile: compact colored dots (titles don't fit narrow cells). */}
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {dayTasks.map(t => (
                      <button
                        key={t.id}
                        onClick={() => onSelect(t.id)}
                        aria-label={t.title}
                        className={`h-2 w-2 rounded-full ${selectedId === t.id ? "ring-2 ring-white/70" : ""}`}
                        style={{ background: typeVisual(visuals, t.category).hex }}
                      />
                    ))}
                  </div>
                  {/* sm+: full title chips. */}
                  <div className="hidden space-y-1 sm:block">
                    {dayTasks.map(t => (
                      <button
                        key={t.id}
                        onClick={() => onSelect(t.id)}
                        className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] transition-colors ${
                          selectedId === t.id ? "bg-indigo-500/20 text-white" : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: typeVisual(visuals, t.category).hex }} />
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
