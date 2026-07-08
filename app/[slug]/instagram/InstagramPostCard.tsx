"use client";

import type { InstagramTask, InstagramType } from "../../data";
import { fmtDate } from "../../data";
import { daysFromToday } from "../../lib/dates";

export type Lane = "overdue" | "week" | "upcoming" | "posted";

// type label → css-var suffix. Unknown/retired types fall back to a muted dot.
const TYPE_KEY: Record<InstagramType, string> = {
  Story:    "story",
  Reel:     "reel",
  Carousel: "carousel",
};
export function typeVar(type: string): string | undefined {
  const key = TYPE_KEY[type as InstagramType];
  return key ? `var(--t-${key})` : undefined;
}

// The due pill: how late / how soon, toned by urgency. Shared with the detail rail.
export function duePill(task: InstagramTask): { cls: string; label: string } {
  if (task.status === "posted") return { cls: "ok", label: "posted" };
  const diff = daysFromToday(task.dueDate);
  if (diff < 0)  return { cls: "late", label: `${Math.abs(diff)}d late` };
  if (diff === 0) return { cls: "soon", label: "today" };
  if (diff <= 7)  return { cls: "soon", label: `in ${diff}d` };
  return { cls: "cool", label: `in ${diff}d` };
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.6z" /></svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);

const ICON_CAL = "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z";

export function InstagramPostCard({
  task,
  lane,
  canManage,
  selected,
  linkedEventTitle,
  onSelect,
  onEdit,
  onDelete,
  onComplete,
}: {
  task: InstagramTask;
  lane: Lane;
  canManage: boolean;
  selected?: boolean;
  /** Title of the event this post promotes, shown as a small chip. */
  linkedEventTitle?: string;
  onSelect: (t: InstagramTask) => void;
  onEdit: (t: InstagramTask) => void;
  onDelete: (t: InstagramTask) => void;
  onComplete: (t: InstagramTask) => void;
}) {
  const pill = duePill(task);
  const tc = typeVar(task.type);
  const posted = task.status === "posted";
  const sub = posted ? `Posted ${fmtDate(task.postedDate ?? task.dueDate)}` : `Due ${fmtDate(task.dueDate)}`;

  // Action buttons live inside the clickable row — stop them from also opening
  // the detail rail.
  const act = (fn: (t: InstagramTask) => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(task); };

  return (
    <article
      className={`ig-post ${lane}${selected ? " selected" : ""}`}
      style={tc ? ({ ["--tc" as string]: tc } as React.CSSProperties) : undefined}
      role="button"
      tabIndex={0}
      aria-label={`View ${task.title}`}
      onClick={() => onSelect(task)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(task); } }}
    >
      <span className="accent" aria-hidden="true" />
      <span className="ig-chip"><span className="dot" />{task.type}</span>
      <div className="body">
        <p className="t">{task.title}</p>
        <p className="sub">{sub}</p>
        {linkedEventTitle && (
          <p className="ig-event-tag">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_CAL} /></svg>
            {linkedEventTitle}
          </p>
        )}
      </div>
      <div className="ig-right">
        <span className={`ig-due ${pill.cls}`}>{pill.label}</span>
        {canManage && (
          <div className="ig-acts">
            {!posted && (
              <button className="ok" title="Mark posted" aria-label="Mark posted" onClick={act(onComplete)}><CheckIcon /></button>
            )}
            <button className="edit" title="Edit" aria-label="Edit post" onClick={act(onEdit)}><EditIcon /></button>
            <button className="del" title="Delete" aria-label="Delete post" onClick={act(onDelete)}><TrashIcon /></button>
          </div>
        )}
      </div>
    </article>
  );
}
