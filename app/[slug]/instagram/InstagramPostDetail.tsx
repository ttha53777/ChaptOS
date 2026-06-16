"use client";

import { useEffect } from "react";
import type { InstagramTask } from "../../data";
import { daysFromToday } from "../../lib/dates";
import { duePill, typeVar } from "./InstagramPostCard";
import { InstagramPostForm, type PostDraft } from "./InstagramPostForm";

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// "Wednesday, June 17, 2026" — parsed as local date parts so the weekday is
// correct regardless of timezone (the ISO string is a plain calendar date).
function fmtFullDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${WEEKDAYS[dow]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

// Plain-language timing, e.g. "3 days overdue" / "Due in 5 days" / "Posted".
function timingLine(task: InstagramTask): string {
  if (task.status === "Complete") return "Posted to the feed";
  const diff = daysFromToday(task.dueDate);
  if (diff < 0)  return `${Math.abs(diff)} day${Math.abs(diff) > 1 ? "s" : ""} overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff} days`;
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.6z" /></svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);

export function InstagramPostDetail({
  task,
  canManage,
  editing,
  onClose,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onComplete,
}: {
  task: InstagramTask;
  canManage: boolean;
  editing: boolean;
  onClose: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: PostDraft) => void;
  onDelete: (t: InstagramTask) => void;
  onComplete: (t: InstagramTask) => void;
}) {
  // Escape closes the rail when reading, or backs out of edit mode when editing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (editing ? onCancelEdit() : onClose()); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, onCancelEdit, onClose]);

  const pill = duePill(task);
  const tc = typeVar(task.type);
  const posted = task.status === "Complete";

  // While editing, the scrim shouldn't dismiss on a stray click (avoid losing
  // form input); it backs out to read mode instead.
  const onScrim = editing ? onCancelEdit : onClose;

  return (
    <>
      <div className="ig-rail-scrim" onClick={onScrim} aria-hidden="true" />
      <aside
        className="ig-rail"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${task.title}` : `${task.title} details`}
        style={tc ? ({ ["--tc" as string]: tc } as React.CSSProperties) : undefined}
      >
        <div className="ig-rail-h">
          <span className="ig-rail-kicker">{editing ? "Edit post" : "Post detail"}</span>
          <button className="ig-rail-close" onClick={onClose} aria-label="Close detail">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {editing ? (
          <div className="ig-rail-body">
            <InstagramPostForm
              initial={{ title: task.title, dueDate: task.dueDate, type: task.type, status: task.status }}
              submitLabel="Save Changes"
              onSubmit={onSave}
              onClose={onCancelEdit}
            />
          </div>
        ) : (
          <>
            <div className="ig-rail-body">
              <span className="ig-chip"><span className="dot" />{task.type}</span>
              <h2 className="ig-rail-title">{task.title}</h2>
              <span className={`ig-due ${pill.cls} ig-rail-due`}>{pill.label}</span>

              <dl className="ig-rail-meta">
                <div>
                  <dt>Status</dt>
                  <dd>{task.status}</dd>
                </div>
                <div>
                  <dt>Timing</dt>
                  <dd>{timingLine(task)}</dd>
                </div>
                <div>
                  <dt>{posted ? "Posted on" : "Scheduled for"}</dt>
                  <dd>{fmtFullDate(task.dueDate)}</dd>
                </div>
                <div>
                  <dt>Format</dt>
                  <dd>{task.type}</dd>
                </div>
              </dl>
            </div>

            {canManage && (
              <div className="ig-rail-acts">
                {!posted && (
                  <button className="primary" onClick={() => onComplete(task)}>
                    <CheckIcon /> Mark posted
                  </button>
                )}
                <button className="ghost" onClick={onStartEdit}>
                  <EditIcon /> Edit
                </button>
                <button className="danger" onClick={() => onDelete(task)}>
                  <TrashIcon /> Delete
                </button>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}
