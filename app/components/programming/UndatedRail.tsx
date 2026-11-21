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
import { BOARD, CALENDAR, undatedFoot, undatedOf } from "@/lib/programme/board";
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
  const undated = undatedOf(tasks);
  const foot = undatedFoot(undated);

  return (
    <aside className="ev-rail-undated" aria-label="Events with no date">
      <div className="ev-ru-head">
        <span className="ev-ru-lbl">{CALENDAR.undated}</span>
        <span className="ev-ru-count">{undated.length}</span>
      </div>
      {undated.length > 0 && draggable && (
        <p className="ev-ru-hint">{CALENDAR.dropHint}</p>
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
              data-stage={t.stage}
              style={{ borderLeftColor: typeVisual(visuals, t.category).hex, ["--tc" as string]: typeVisual(visuals, t.category).hex }}
            >
              <span className="t">{t.title}</span>
              <span className="m">
                <span className="st">{STAGE_LABELS[t.stage]}</span>
                <span className="ow">{owner ?? BOARD.noOwner}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="ev-ru-foot">{foot}</p>
    </aside>
  );
}
