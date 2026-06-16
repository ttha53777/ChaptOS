"use client";

import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";
import { TypeBadge, StarRating } from "./PrepStatusPill";
import { programmingPrepScore } from "@/lib/programming";
import { todayStr } from "../../lib/dates";

const TODAY = todayStr();

function countdown(dueDate: string | null): { label: string; tone: string } | null {
  if (!dueDate) return null;
  if (dueDate < TODAY) return { label: "past", tone: "bg-white/[0.05] text-slate-500" };
  const days = Math.round((new Date(dueDate + "T00:00:00").getTime() - new Date(TODAY + "T00:00:00").getTime()) / 86_400_000);
  if (days === 0) return { label: "Today", tone: "bg-red-500/15 text-red-300" };
  if (days === 1) return { label: "Tomorrow", tone: "bg-red-500/15 text-red-300" };
  if (days <= 7)  return { label: `in ${days}d`, tone: "bg-amber-500/15 text-amber-300" };
  return { label: `in ${days}d`, tone: "bg-white/[0.06] text-slate-400" };
}

// Dusk variant: type → 2-letter glyph + tone class (mirrors _design/Events Redesign.html).
const DUSK_GLYPH: Record<string, { txt: string; cls: string }> = {
  Program:             { txt: "PR", cls: "" },
  Social:              { txt: "SO", cls: "social" },
  Fundraiser:          { txt: "FU", cls: "fundy" },
  "Community Service": { txt: "CS", cls: "service" },
};

/** Dusk countdown: short relative label + tone (no date set / today / soon / far). */
function duskWhen(dueDate: string | null): { label: string; tone: "" | "soon" | "today" } {
  if (!dueDate) return { label: "No date", tone: "" };
  if (dueDate < TODAY) return { label: fmtDate(dueDate), tone: "" };
  const days = Math.round((new Date(dueDate + "T00:00:00").getTime() - new Date(TODAY + "T00:00:00").getTime()) / 86_400_000);
  if (days === 0) return { label: "Today", tone: "today" };
  if (days === 1) return { label: "Tomorrow", tone: "today" };
  if (days <= 7) return { label: `${days}d`, tone: "soon" };
  return { label: fmtDate(dueDate), tone: "" };
}

export function ProgrammingCard({
  task,
  selected,
  draggable = true,
  isDragging = false,
  animIndex = 0,
  variant = "default",
  onClick,
  onDragStart,
}: {
  task: ProgrammingTask;
  selected: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  animIndex?: number;
  /** "dusk" swaps to the prep-ring editorial card used by the redesigned events page. */
  variant?: "default" | "dusk";
  onClick: () => void;
  onDragStart: () => void;
}) {
  if (variant === "dusk") {
    return (
      <DuskCard
        task={task}
        selected={selected}
        draggable={draggable}
        isDragging={isDragging}
        animIndex={animIndex}
        onClick={onClick}
        onDragStart={onDragStart}
      />
    );
  }
  return (
    <DefaultCard
      task={task}
      selected={selected}
      draggable={draggable}
      isDragging={isDragging}
      animIndex={animIndex}
      onClick={onClick}
      onDragStart={onDragStart}
    />
  );
}

type CardProps = {
  task: ProgrammingTask;
  selected: boolean;
  draggable: boolean;
  isDragging: boolean;
  animIndex: number;
  onClick: () => void;
  onDragStart: () => void;
};

function DefaultCard({
  task,
  selected,
  draggable,
  isDragging,
  animIndex,
  onClick,
  onDragStart,
}: CardProps) {
  const cd = countdown(task.dueDate);
  const done = task.checklist.filter(c => c.done).length;
  const total = task.checklist.length;
  const isDone = task.stage === "done";

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onClick={onClick}
      className={`animate-fade-slide-in cursor-pointer rounded-lg border p-3 transition-[colors,opacity,transform] duration-150 ${
        isDragging
          ? "scale-95 opacity-40"
          : selected
            ? "border-indigo-500/40 bg-indigo-500/[0.06] ring-1 ring-inset ring-indigo-500/20"
            : isDone
              ? "border-white/[0.06] bg-[#0e1119] opacity-80 hover:opacity-100"
              : "border-white/[0.07] bg-[#10131c] hover:border-white/[0.14]"
      }`}
      style={{ animationDelay: `${Math.min(animIndex, 6) * 40}ms` }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <TypeBadge type={task.type} />
        {cd && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${cd.tone}`}>{cd.label}</span>}
      </div>
      <p className={`line-clamp-2 text-[13px] font-semibold leading-snug ${isDone ? "text-slate-200" : "text-white"}`}>{task.title}</p>
      <p className="mt-1.5 truncate text-[11px] text-slate-500">
        {task.dueDate ? fmtDate(task.dueDate) : "No date set"}
        {task.location ? ` · ${task.location}` : ""}
        {task.collab ? ` · w/ ${task.collab}` : ""}
      </p>

      {isDone ? (
        <div className="mt-2 text-[12px] text-amber-400">
          <StarRating value={task.successRating} disabled onChange={() => {}} />
        </div>
      ) : total > 0 ? (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>Checklist</span>
            <span className="tabular-nums">{done}/{total}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full rounded-full ${done === total ? "bg-emerald-500" : "bg-indigo-500"}`}
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const RING_CIRC = 2 * Math.PI * 15; // r=15 → ~94.25

/** Dusk-themed card for the redesigned events pipeline: type glyph, relative date,
 *  and a prep ring (or success stars when done). Styled via .ev-* classes in
 *  events-ledger.css; tokens resolve from the .dash.dash-events scope. */
function DuskCard({
  task,
  selected,
  draggable,
  isDragging,
  animIndex,
  onClick,
  onDragStart,
}: CardProps) {
  const isDone = task.stage === "done";
  const glyph = DUSK_GLYPH[task.type] ?? { txt: task.type.slice(0, 2).toUpperCase(), cls: "" };
  const when = duskWhen(task.dueDate);
  const { done, total } = programmingPrepScore(task);
  const full = total > 0 && done === total;
  const offset = total > 0 ? RING_CIRC * (1 - done / total) : RING_CIRC;

  const sub = [task.type, task.location || null, task.collab ? `w/ ${task.collab}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onClick={onClick}
      className={`ev-card animate-fade-slide-in${isDone ? " ghost" : ""}${selected ? " sel" : ""}${isDragging ? " dragging" : ""}`}
      style={{ animationDelay: `${Math.min(animIndex, 6) * 40}ms` }}
    >
      <div className="ec-top">
        <span className={`ev-glyph ${glyph.cls}`}>{glyph.txt}</span>
        <span className={`ec-when${when.tone ? ` ${when.tone}` : ""}`}>{when.label}</span>
      </div>
      <div className="ec-t">{task.title}</div>
      {sub && <div className="ec-sub">{sub}</div>}
      <div className="ec-foot">
        {isDone ? (
          <>
            <span className="ec-prep">Wrapped</span>
            {task.successRating != null && (
              <span className="stars">{"★".repeat(task.successRating)}</span>
            )}
          </>
        ) : (
          <>
            <svg className="ev-ring" viewBox="0 0 36 36" aria-hidden>
              <circle className="track" cx="18" cy="18" r="15" />
              <circle
                className={`val${full ? " full" : ""}`}
                cx="18"
                cy="18"
                r="15"
                strokeDasharray={RING_CIRC.toFixed(2)}
                strokeDashoffset={offset.toFixed(2)}
              />
            </svg>
            <span className="ec-prep">
              <b>{done}</b>/{total} {full ? "ready" : "prep"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
