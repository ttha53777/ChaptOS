import React from "react";
import { fmtDate, type InstagramTask } from "../../../data";

function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Instagram rail — queued posts with a due-date tone (overdue rose, due-soon
 * gold, else muted). Per-row management lives in the existing Instagram drawer
 * (All) and the Add modal; the rail itself stays read-only/clean. Carries
 * `id="sec-instagram"`.
 */
export function InstagramRail({
  tasks,
  today,
  onAdd,
  onAll,
}: {
  tasks: InstagramTask[];
  today: string;
  onAdd?: () => void;
  onAll?: () => void;
}) {
  const soon = isoPlusDays(today, 7);
  const overdue = tasks.filter((t) => t.dueDate < today).length;
  const sub = overdue > 0 ? `${overdue} of ${tasks.length} overdue` : `${tasks.length} queued`;

  return (
    <section id="sec-instagram" className="card" aria-label="Instagram">
      <div className="card-h">
        <h2>Instagram</h2>
        <div className="right">
          <span className="sub">{sub}</span>
          {onAll && <button type="button" className="card-act" onClick={onAll}>All</button>}
          {onAdd && <button type="button" className="card-act" onClick={onAdd}>+ Add</button>}
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="rail-empty">No posts queued — add one to plan content.</div>
      ) : (
        tasks.slice(0, 6).map((t) => {
          const tone = t.dueDate < today ? "rose" : t.dueDate <= soon ? "gold" : "muted";
          return (
            <div key={t.id} className="ig-row">
              <span className="ig-type">{t.type}</span>
              <p className="t">{t.title}</p>
              <span className={`d ${tone}`}>{fmtDate(t.dueDate)}</span>
            </div>
          );
        })
      )}
    </section>
  );
}
