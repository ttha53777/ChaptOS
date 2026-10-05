"use client";
import { useEffect, useRef } from "react";
import type { InstagramTask } from "../../data";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { instagramDate, instagramDays, postedOn } from "@/lib/instagram-planner";
import { duePill } from "./InstagramPostCard";
import { FORMAT_HINTS, formatKey, InstagramSnapshot } from "./InstagramSnapshot";
import { InstagramPostForm, type PostDraft, type PostFormEvent } from "./InstagramPostForm";

function EditableDate({ value, label, canManage, busy, onChange }: { value: string; label: string; canManage: boolean; busy: boolean; onChange: (date: string) => void }) {
  if (!canManage) return <>{instagramDate(value, true)}</>;
  return <label className="igp-date">{instagramDate(value, true)}<PaperIcon name="pencil" /><input aria-label={label} disabled={busy} type="date" value={value} onChange={e => { if (e.target.value && e.target.value !== value) onChange(e.target.value); }} /></label>;
}
export function InstagramPostDetail({ task, today, canManage, editing, stamped, busy, error, events, linkedEvent, eventsError, eventsLoading, onRetryEvents, onOpenEvent, onClose, onStartEdit, onCancelEdit, onSave, onChangeDate, onChangePostedDate, onDelete, onComplete }: {
  task: InstagramTask; today: string; canManage: boolean; editing: boolean; stamped?: boolean; busy: boolean; error: string | null; events: PostFormEvent[]; linkedEvent: PostFormEvent | null;
  eventsError: boolean; eventsLoading: boolean; onRetryEvents: () => void;
  onOpenEvent: () => void; onClose: () => void; onStartEdit: () => void; onCancelEdit: () => void; onSave: (draft: PostDraft) => void;
  onChangeDate: (date: string) => void; onChangePostedDate: (date: string) => void; onDelete: (task: InstagramTask) => void; onComplete: (task: InstagramTask, from: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  useEffect(() => { if (editing) ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(); }, [editing]);
  const pill = duePill(task, today), posted = task.status === "posted", days = instagramDays(task.dueDate, today);
  const dismiss = () => { if (!busy) (editing ? onCancelEdit : onClose)(); };
  const timing = posted ? "Posted to the feed" : days < 0 ? `${-days} day${days < -1 ? "s" : ""} overdue` : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
  return <dialog ref={ref} className={`igp-scope igp-rail igp-ty-${formatKey(task.type)}`} aria-label={`${editing ? "Edit" : "Post detail:"} ${task.title}`} onCancel={e => { e.preventDefault(); dismiss(); }} onClick={e => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dismiss();
  }}>
    <div className="igp-rail-h"><p>{editing ? "Edit post" : "Post detail"}</p><button className="igp-iconbtn" aria-label="Close (esc)" onClick={onClose} disabled={busy}><PaperIcon name="plus" className="pp-ic igp-close" /></button></div>
    {editing ? <div className="igp-rail-b"><InstagramPostForm key={task.id} initial={{ title: task.title, type: task.type, dueDate: task.dueDate, postedDate: task.postedDate ?? null, calendarEventId: task.calendarEventId ?? null }} submitLabel="Save changes" variant="rail" onSubmit={onSave} onClose={onCancelEdit} events={events} today={today} showPostedDate={posted} busy={busy} error={error} eventsError={eventsError} eventsLoading={eventsLoading} onRetryEvents={onRetryEvents} /></div> : <>
      <div className="igp-rail-b">
        <div className="stage"><span className="tape" /><InstagramSnapshot type={task.type} large developing={!posted} />{posted && <span className={`igp-stamp${stamped ? " thud" : ""}`}>POSTED</span>}</div>
        <span className="igp-chip"><i />{task.type}</span><h2>{task.title}</h2><span className={`igp-due ${pill.cls}`}>{pill.label}</span>
        <dl className="igp-dl">
          <div><dt>Timing</dt><dd>{timing}</dd></div>
          {posted && <div><dt>Posted on</dt><dd><EditableDate value={postedOn(task)} label="Change posting date" canManage={canManage} busy={busy} onChange={onChangePostedDate} /></dd></div>}
          <div><dt>{posted ? "Due date" : "Scheduled for"}</dt><dd><EditableDate value={task.dueDate} label="Change due date" canManage={canManage} busy={busy} onChange={onChangeDate} /></dd></div>
          <div><dt>Format</dt><dd>{task.type}{FORMAT_HINTS[task.type] && <> · <span className="igp-muted">{FORMAT_HINTS[task.type]}</span></>}</dd></div>
          {linkedEvent && <div><dt>Promoting</dt><dd><button className="igp-evlink" onClick={onOpenEvent}><PaperIcon name="cal" />{linkedEvent.title} · {instagramDate(linkedEvent.date)}</button></dd></div>}
        </dl>
        {eventsError && task.calendarEventId != null && <p className="igp-error" role="alert">Couldn't load the linked event. <button onClick={onRetryEvents}>Try again</button></p>}
        {error && <p className="igp-error" role="alert">{error}</p>}
      </div>
      {canManage && <div className="igp-rail-f">
        {!posted && <button className="igp-btn" disabled={busy} onClick={e => onComplete(task, e.currentTarget)}><PaperIcon name="check" />{busy ? "Saving…" : "Mark posted"}</button>}
        <button className="igp-btn ghost" disabled={busy} onClick={onStartEdit}><PaperIcon name="pencil" />Edit</button>
        <button className="igp-btn del" disabled={busy} aria-label="Delete post" onClick={() => onDelete(task)}><PaperIcon name="trash" /></button>
      </div>}
    </>}
  </dialog>;
}
