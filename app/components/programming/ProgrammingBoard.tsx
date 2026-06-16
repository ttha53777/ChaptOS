"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgrammingTask } from "../../data";
import { STAGES, STAGE_LABELS, STAGE_PILL, type ProgrammingStage } from "@/lib/state/programming-stage";
import { ProgrammingCard } from "./ProgrammingCard";

export function ProgrammingBoard({
  tasks,
  selectedId,
  canManage,
  variant = "default",
  onSelect,
  onMoveStage,
}: {
  tasks: ProgrammingTask[];
  selectedId: number | null;
  canManage: boolean;
  /** "dusk" renders dusk lanes + prep-ring cards for the redesigned events page. */
  variant?: "default" | "dusk";
  onSelect: (id: number) => void;
  /** Returns false if the move was rejected (e.g. promote without a date). */
  onMoveStage: (id: number, stage: ProgrammingStage) => Promise<boolean>;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<ProgrammingStage | null>(null);
  // Native HTML5 drag-and-drop doesn't work on touch; on those devices we tell
  // users to open the card and change its stage from the detail panel instead.
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  const dndEnabled = canManage && !touch;

  const byStage = useMemo(() => {
    const map: Record<ProgrammingStage, ProgrammingTask[]> = { idea: [], planning: [], confirmed: [], done: [] };
    for (const t of tasks) (map[t.stage] ?? map.idea).push(t);
    return map;
  }, [tasks]);

  async function handleDrop(stage: ProgrammingStage) {
    const id = dragId;
    setDragId(null);
    setOverStage(null);
    if (id == null) return;
    const task = tasks.find(t => t.id === id);
    if (!task || task.stage === stage) return;
    await onMoveStage(id, stage);
  }

  if (variant === "dusk") {
    return (
      <div className="ev-pipeline">
        {STAGES.map(stage => {
          const items = byStage[stage];
          const isOver = overStage === stage && canManage;
          return (
            <div
              key={stage}
              onDragOver={dndEnabled ? e => { e.preventDefault(); setOverStage(stage); } : undefined}
              onDragLeave={() => setOverStage(s => (s === stage ? null : s))}
              onDrop={dndEnabled ? () => handleDrop(stage) : undefined}
              className={`ev-lane${isOver ? " drop" : ""}`}
            >
              <div className="ev-lane-head">
                <span className={`dot ${stage}`} />
                <span className="lh">{STAGE_LABELS[stage]}</span>
                <span className="lc">{items.length}</span>
              </div>
              <div className="ev-lane-body">
                {items.length === 0 ? (
                  <p className="empty">{dndEnabled ? "Drop here" : "Nothing here"}</p>
                ) : (
                  items.map((task, i) => (
                    <ProgrammingCard
                      key={task.id}
                      task={task}
                      variant="dusk"
                      selected={selectedId === task.id}
                      draggable={dndEnabled}
                      isDragging={dragId === task.id}
                      animIndex={i}
                      onClick={() => onSelect(task.id)}
                      onDragStart={() => setDragId(task.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[repeat(4,minmax(220px,1fr))] sm:gap-4 sm:overflow-x-auto sm:pb-2">
      {STAGES.map(stage => {
        const items = byStage[stage];
        const pill = STAGE_PILL[stage];
        const isOver = overStage === stage && canManage;
        return (
          <div
            key={stage}
            onDragOver={dndEnabled ? e => { e.preventDefault(); setOverStage(stage); } : undefined}
            onDragLeave={() => setOverStage(s => (s === stage ? null : s))}
            onDrop={dndEnabled ? () => handleDrop(stage) : undefined}
            className={`flex min-w-0 flex-col rounded-xl border bg-[#0c0f16] transition-colors duration-150 ${
              isOver ? "border-indigo-500/40 ring-1 ring-inset ring-indigo-500/20" : "border-white/[0.06]"
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/[0.05] px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-300">{STAGE_LABELS[stage]}</span>
                <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-slate-400">{items.length}</span>
              </div>
            </div>
            <div className={`flex flex-col gap-2.5 p-2.5 sm:min-h-[120px] transition-colors duration-150 ${isOver ? "bg-indigo-500/[0.05]" : ""}`}>
              {items.length === 0 ? (
                <p className="px-1 py-4 text-center text-[11px] text-slate-600 sm:py-6">
                  {dndEnabled ? "Drop events here" : "Nothing here"}
                </p>
              ) : (
                items.map((task, i) => (
                  <ProgrammingCard
                    key={task.id}
                    task={task}
                    selected={selectedId === task.id}
                    draggable={dndEnabled}
                    isDragging={dragId === task.id}
                    animIndex={i}
                    onClick={() => onSelect(task.id)}
                    onDragStart={() => setDragId(task.id)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
