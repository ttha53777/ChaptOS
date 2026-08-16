"use client";

/**
 * What the rest of the chapter can actually see.
 *
 * The board's four lanes are an officer's view — three of them are private
 * working state. This strip is the other half of that promise: it shows only
 * Confirmed and Done, which is exactly what reaches the chapter's timeline, so
 * "published" stops being an abstraction and becomes a list you can point at.
 *
 * Departures are animated deliberately. Demoting a confirmed event pulls it off
 * everyone's calendar, and the redraw lags just long enough for you to SEE the
 * chip leave — a silent disappearance is the same pixels as a rendering bug.
 */

import { useEffect, useRef, useState } from "react";
import type { ProgrammingTask } from "../../data";
import { fmtDate } from "../../data";
import { typeVisual, type TypeVisual } from "./typeColor";

/** How long a departing chip stays on screen before the list settles. */
const LEAVE_MS = 300;

export function TimelineStrip({
  tasks,
  visuals,
  onSelect,
}: {
  tasks: ProgrammingTask[];
  visuals: Map<string, TypeVisual>;
  onSelect: (id: number) => void;
}) {
  const published = tasks
    .filter(t => t.stage === "confirmed" || t.stage === "done")
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  // Ids rendered last pass, so an arrival can be told from a departure.
  const prevIds = useRef<Set<number>>(new Set());
  const [leaving, setLeaving] = useState<ProgrammingTask[]>([]);
  const seededRef = useRef(false);

  useEffect(() => {
    const now = new Set(published.map(t => t.id));
    const gone = [...prevIds.current].filter(id => !now.has(id));
    prevIds.current = now;
    // Skip the very first pass, or every chip animates in on mount as though
    // the whole term had just been published at once.
    if (!seededRef.current) { seededRef.current = true; return; }
    if (gone.length === 0) return;
    const departed = gone
      .map(id => tasks.find(t => t.id === id))
      .filter((t): t is ProgrammingTask => t != null);
    if (departed.length === 0) return;
    setLeaving(departed);
    const timer = setTimeout(() => setLeaving([]), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [published.map(t => t.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="ev-tl" aria-label="On the chapter timeline">
      <div className="ev-tl-head">
        <span className="ev-tl-lbl">On the chapter timeline</span>
        <span className="ev-tl-sub">what everyone sees</span>
        <span className="ev-tl-count">{published.length} published</span>
      </div>
      {published.length === 0 && leaving.length === 0 ? (
        <p className="ev-tl-empty">
          Nothing published yet. Confirming an event is what puts it here.
        </p>
      ) : (
        <div className="ev-tl-body">
          {published.map(t => {
            const v = typeVisual(visuals, t.category);
            const isNew = !prevIds.current.has(t.id) && seededRef.current;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className={`ev-tl-chip${isNew ? " enter" : ""}${t.stage === "done" ? " done" : ""}`}
              >
                <span className="cdot" style={{ background: v.hex }} />
                <span className="t">{t.title}</span>
                {t.location && <span className="l">{t.location}</span>}
                <span className="d">{t.dueDate ? fmtDate(t.dueDate) : "—"}</span>
              </button>
            );
          })}
          {leaving.map(t => (
            <span key={`leave-${t.id}`} className="ev-tl-chip leave" aria-hidden>
              <span className="cdot" style={{ background: typeVisual(visuals, t.category).hex }} />
              <span className="t">{t.title}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
