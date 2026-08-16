"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgrammingTask } from "../../data";
import { STAGES, STAGE_LABELS, STAGE_PILL, type ProgrammingStage } from "@/lib/state/programming-stage";
import { canEnter, missingFor, needsConfirmFirst } from "@/lib/programming";
import { ProgrammingCard } from "./ProgrammingCard";
import { typeVisual, type TypeVisual } from "./typeColor";

export function ProgrammingBoard({
  tasks,
  visuals,
  selectedId,
  canManage,
  variant = "default",
  onSelect,
  onMoveStage,
}: {
  tasks: ProgrammingTask[];
  /** slug → colour/glyph, built once from the org's event types. */
  visuals: Map<string, TypeVisual>;
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
  const [showAllDone, setShowAllDone] = useState(false);
  const DONE_LIMIT = 6;
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
    map.done.sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""));
    return map;
  }, [tasks]);

  async function handleDrop(stage: ProgrammingStage) {
    const id = dragId;
    setDragId(null);
    setOverStage(null);
    if (id == null) return;
    const task = tasks.find(t => t.id === id);
    if (!task || task.stage === stage) return;
    // The gate itself lives in onMoveStage: a blocked drop opens the step that
    // unblocks it. The board's job is to SAY what will happen before you let go.
    await onMoveStage(id, stage);
  }

  /**
   * What dropping here would mean, said before the drop.
   *
   * This is the only place a lane's rule appears, so it names the rule rather
   * than saying "Drop here" — a cue that only reports where the cursor is tells
   * you nothing you didn't already know from moving it there.
   */
  const dragTask = dragId != null ? tasks.find(t => t.id === dragId) ?? null : null;
  function dropCue(stage: ProgrammingStage): { text: string; blocked: boolean } | null {
    if (!dragTask || dragTask.stage === stage) return null;
    if (needsConfirmFirst(dragTask, stage)) {
      return { text: "Confirm it first — the chapter has to have seen it", blocked: true };
    }
    const forward = STAGES.indexOf(stage) > STAGES.indexOf(dragTask.stage);
    if (forward && !canEnter(dragTask, stage)) {
      const miss = missingFor(dragTask, stage).map(f => f.label.toLowerCase()).join(" + ");
      return { text: `Needs ${miss} — drop to fill in`, blocked: true };
    }
    if (stage === "confirmed") return { text: "Drop to confirm — the chapter will see it", blocked: false };
    // Demoting a published event pulls it back off everyone's calendar. That is
    // allowed and sometimes correct, but it should never be a surprise.
    if ((dragTask.stage === "confirmed" || dragTask.stage === "done") && !forward) {
      return { text: "Drop — comes off the timeline", blocked: false };
    }
    return null;
  }

  if (variant === "dusk") {
    return (
      <div className="ev-pipeline">
        {STAGES.map(stage => {
          const items = byStage[stage];
          const isOver = overStage === stage && canManage;
          const cue = isOver ? dropCue(stage) : null;
          return (
            <div
              key={stage}
              onDragOver={dndEnabled ? e => { e.preventDefault(); setOverStage(stage); } : undefined}
              onDragLeave={() => setOverStage(s => (s === stage ? null : s))}
              onDrop={dndEnabled ? () => handleDrop(stage) : undefined}
              className={`ev-lane${isOver ? " drop" : ""}${cue?.blocked ? " gated" : ""}`}
            >
              <div className="ev-lane-head">
                <span className={`dot ${stage}`} />
                <span className="lh">{STAGE_LABELS[stage]}</span>
                <span className="lc">{items.length}</span>
              </div>
              {cue ? (
                <p className={`ev-lane-cue${cue.blocked ? " gated" : ""}`}>{cue.text}</p>
              ) : (
                <p className="ev-lane-sub">
                  {/* The publish boundary is CONFIRMED, not Planning. Planning used
                      to publish, which is exactly what made Idea→Planning a drag
                      with no consequence — both lanes said the same thing. */}
                  {stage === "idea"     ? "Backlog · not on the timeline"
                    : stage === "planning" ? "Owned · not yet public"
                    : "On the chapter's timeline"}
                </p>
              )}
              <div className="ev-lane-body">
                {items.length === 0 ? (
                  <p className="empty">{dndEnabled ? "Drop here" : "Nothing here"}</p>
                ) : (() => {
                  const visible = stage === "done" && !showAllDone ? items.slice(0, DONE_LIMIT) : items;
                  const hidden = stage === "done" ? items.length - visible.length : 0;
                  return (
                    <>
                      {visible.map((task, i) => (
                        <ProgrammingCard
                          key={task.id}
                          task={task}
                          visual={typeVisual(visuals, task.category)}
                          variant="dusk"
                          selected={selectedId === task.id}
                          draggable={dndEnabled}
                          isDragging={dragId === task.id}
                          animIndex={i}
                          onClick={() => onSelect(task.id)}
                          onDragStart={() => setDragId(task.id)}
                        />
                      ))}
                      {hidden > 0 && (
                        <button className="ev-done-more" onClick={() => setShowAllDone(true)}>
                          +{hidden} more
                        </button>
                      )}
                      {stage === "done" && showAllDone && items.length > DONE_LIMIT && (
                        <button className="ev-done-more" onClick={() => setShowAllDone(false)}>
                          Show less
                        </button>
                      )}
                    </>
                  );
                })()}
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
              ) : (() => {
                const visible = stage === "done" && !showAllDone ? items.slice(0, DONE_LIMIT) : items;
                const hidden = stage === "done" ? items.length - visible.length : 0;
                return (
                  <>
                    {visible.map((task, i) => (
                      <ProgrammingCard
                        key={task.id}
                        task={task}
                        visual={typeVisual(visuals, task.category)}
                        selected={selectedId === task.id}
                        draggable={dndEnabled}
                        isDragging={dragId === task.id}
                        animIndex={i}
                        onClick={() => onSelect(task.id)}
                        onDragStart={() => setDragId(task.id)}
                      />
                    ))}
                    {hidden > 0 && (
                      <button
                        onClick={() => setShowAllDone(true)}
                        className="mt-1 w-full rounded-lg border border-white/[0.06] py-2 text-[11px] text-slate-500 transition-colors hover:border-white/10 hover:text-slate-400"
                      >
                        +{hidden} more
                      </button>
                    )}
                    {stage === "done" && showAllDone && items.length > DONE_LIMIT && (
                      <button
                        onClick={() => setShowAllDone(false)}
                        className="mt-1 w-full rounded-lg border border-white/[0.06] py-2 text-[11px] text-slate-500 transition-colors hover:border-white/10 hover:text-slate-400"
                      >
                        Show less
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
