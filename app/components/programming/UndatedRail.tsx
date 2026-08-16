"use client";

/**
 * The events with no date yet, beside the month they're missing from.
 *
 * A calendar shows what's scheduled, which quietly means the undated events are
 * the ones you can't see precisely when you're looking at the thing that would
 * remind you about them. Parking them in the margin — draggable onto a day —
 * turns "what haven't we scheduled" from a question you have to think to ask
 * into something already on screen.
 *
 * The footer says what dating one BUYS, because that is the rail's whole point:
 * an event waiting on nothing but a date is one drag from being published, and
 * one waiting on a location too is not, and those deserve different urgency.
 */

import type { ProgrammingTask } from "../../data";
import { missingFor } from "@/lib/programming";
import { ownerShortLabel } from "@/lib/event-owner";
import { STAGE_LABELS } from "@/lib/state/programming-stage";
import { typeVisual, type TypeVisual } from "./typeColor";

export function UndatedRail({
  tasks,
  visuals,
  selectedId,
  draggable,
  onSelect,
  onDragStart,
}: {
  tasks: ProgrammingTask[];
  visuals: Map<string, TypeVisual>;
  selectedId: number | null;
  draggable: boolean;
  onSelect: (id: number) => void;
  onDragStart: (id: number) => void;
}) {
  // Done events are excluded: an event with no date that already happened is a
  // record-keeping problem, not something to schedule.
  const undated = tasks.filter(t => !t.dueDate && t.stage !== "done");

  // Waiting on nothing but a date — one drag from being confirmable.
  const readyBarDate = undated.filter(
    t => t.stage === "planning" && missingFor(t, "confirmed").every(f => f.key === "date"),
  ).length;

  const foot =
    undated.length === 0
      ? "Every event on the slate is on the month."
      : readyBarDate > 0
        ? `${readyBarDate} of these ${readyBarDate === 1 ? "is" : "are"} waiting on nothing but a date.`
        : "A date alone won't confirm them — they're missing other fields too.";

  return (
    <aside className="ev-rail-undated" aria-label="Events with no date">
      <div className="ev-ru-head">
        <span className="ev-ru-lbl">No date yet</span>
        <span className="ev-ru-count">{undated.length}</span>
      </div>
      {undated.length > 0 && draggable && (
        <p className="ev-ru-hint">Drop one on a day to set its date.</p>
      )}

      <div className="ev-ru-body">
        {undated.map(t => {
          const owner = ownerShortLabel(t.owner);
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              draggable={draggable}
              onDragStart={draggable ? () => onDragStart(t.id) : undefined}
              onClick={() => onSelect(t.id)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(t.id); }
              }}
              className={`ev-ru-card${selectedId === t.id ? " sel" : ""}`}
              style={{ borderLeftColor: typeVisual(visuals, t.category).hex }}
            >
              <span className="t">{t.title}</span>
              <span className="m">
                <span className="st">{STAGE_LABELS[t.stage]}</span>
                <span className="ow">{owner ?? "No owner"}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="ev-ru-foot">{foot}</p>
    </aside>
  );
}
