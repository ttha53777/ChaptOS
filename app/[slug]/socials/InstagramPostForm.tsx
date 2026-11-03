"use client";
import { useId, useState } from "react";
import { INSTAGRAM_TYPES } from "@/lib/validation/instagram";
import { instagramDate, instagramDays } from "@/lib/instagram-planner";
import { FORMAT_HINTS, formatKey, InstagramSnapshot } from "./InstagramSnapshot";

export type PostDraft = { title: string; dueDate: string; postedDate: string | null; type: string; calendarEventId: number | null };
export type PostFormEvent = { id: number; title: string; date: string; category?: string };
/** "sheet" lays out as the Add post composer (body + footer note); "rail" is the
 *  edit-in-place form inside the post's side rail. */
export function InstagramPostForm({ initial, submitLabel, onSubmit, onClose, variant, events = [], showPostedDate = false, busy = false, error, today, eventsError, eventsLoading, onRetryEvents }: {
  initial: PostDraft; submitLabel: string; onSubmit: (d: PostDraft) => void; onClose: () => void; variant: "sheet" | "rail"; events?: PostFormEvent[]; showPostedDate?: boolean; busy?: boolean; error?: string | null; today: string;
  eventsError?: boolean; eventsLoading?: boolean; onRetryEvents?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const id = useId();
  const legacy = !(INSTAGRAM_TYPES as readonly string[]).includes(initial.type);
  const choices = events.filter(e => e.id === form.calendarEventId || (e.category !== "deadline" && instagramDays(e.date, today) >= -14));
  const fields = <fieldset disabled={busy} className="igp-fields">
    <label className="igp-fld" htmlFor={`${id}-title`}><span>Post title</span><input id={`${id}-title`} className="igp-inp" required maxLength={200} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Meet the brothers reel" data-autofocus /></label>
    <fieldset className="igp-format-field"><legend>Format</legend>
      {legacy && <label className="igp-legacy-option"><input type="radio" name={`${id}-type`} checked={form.type === initial.type} onChange={() => setForm(f => ({ ...f, type: initial.type }))} />Keep {initial.type}<small>Choose a format below only if you want to change it.</small></label>}
      <div className="igp-types">{INSTAGRAM_TYPES.map(type => <label key={type}>
        <input type="radio" name={`${id}-type`} value={type} checked={form.type === type} onChange={() => setForm(f => ({ ...f, type }))} />
        <span className={`o igp-ty-${formatKey(type)}`}><span className="sn"><InstagramSnapshot type={type} /></span>{type}<small>{FORMAT_HINTS[type]}</small></span>
      </label>)}</div>
    </fieldset>
    <div className="igp-two"><label className="igp-fld"><span>Due date</span><input className="igp-inp" required type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></label>
      {showPostedDate ? <label className="igp-fld"><span>Posting date</span><input className="igp-inp" type="date" value={form.postedDate ?? ""} onChange={e => setForm(f => ({ ...f, postedDate: e.target.value || null }))} /></label> : <span />}
    </div>
    <label className="igp-fld"><span>Linked event <small>— optional, the event this post promotes</small></span>
      <select className="igp-inp" value={form.calendarEventId ?? ""} onChange={e => setForm(f => ({ ...f, calendarEventId: e.target.value ? Number(e.target.value) : null }))} disabled={eventsLoading}>
        <option value="">— None —</option>
        {form.calendarEventId != null && !choices.some(e => e.id === form.calendarEventId) && <option value={form.calendarEventId}>Current linked event</option>}
        {choices.map(e => <option key={e.id} value={e.id}>{e.title} · {instagramDate(e.date)}</option>)}
      </select>
    </label>
    {eventsError && <p className="igp-error" role="alert">Couldn&apos;t load events. <button type="button" onClick={onRetryEvents}>Try again</button></p>}
    {error && <p className="igp-error" role="alert">{error}</p>}
  </fieldset>;
  const cancel = <button className="igp-btn soft" type="button" onClick={onClose} disabled={busy}>Cancel</button>;
  const submit = <button className="igp-btn" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>;
  return <form className="igp-form" aria-busy={busy} onSubmit={e => { e.preventDefault(); if (!busy) onSubmit({ ...form, title: form.title.trim() }); }}>
    {variant === "sheet"
      ? <><div className="igp-sheet-b">{fields}</div><div className="igp-sheet-f"><span className="note">Lands in its lane by date — and on the month view.</span>{cancel}{submit}</div></>
      : <>{fields}<div className="igp-form-footer">{cancel}{submit}</div></>}
  </form>;
}
