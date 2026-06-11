"use client";

import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";
import { TypeBadge, StarRating } from "./PrepStatusPill";
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

export function ProgrammingCard({
  task,
  selected,
  draggable = true,
  onClick,
  onDragStart,
}: {
  task: ProgrammingTask;
  selected: boolean;
  draggable?: boolean;
  onClick: () => void;
  onDragStart: () => void;
}) {
  const cd = countdown(task.dueDate);
  const done = task.checklist.filter(c => c.done).length;
  const total = task.checklist.length;
  const isDone = task.stage === "done";

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onClick={onClick}
      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
        selected
          ? "border-indigo-500/40 bg-indigo-500/[0.06] ring-1 ring-inset ring-indigo-500/20"
          : isDone
            ? "border-white/[0.06] bg-[#0e1119] opacity-80 hover:opacity-100"
            : "border-white/[0.07] bg-[#10131c] hover:border-white/[0.14]"
      }`}
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
