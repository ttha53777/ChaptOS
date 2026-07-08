"use client";

import { useState } from "react";
import { FieldLabel } from "../../components/dashboard/primitives";
import { inputDuskCls } from "../../components/dashboard/styles";
import type { InstagramType } from "../../data";
import { INSTAGRAM_TYPES } from "@/lib/validation/instagram";

export type PostDraft = {
  title: string;
  dueDate: string;
  /** The actual day the post went live, or null if not posted / unset. */
  postedDate: string | null;
  type: InstagramType;
  /** The event this post promotes, or null when unlinked. */
  calendarEventId: number | null;
};

/** Minimal shape of a calendar event, for the optional "Linked event" picker. */
export type PostFormEvent = { id: number; title: string; date: string };

// No status picker: new posts are "open" and reach "posted" via "Mark posted".
// Urgency is derived from dueDate, never chosen here.

export function InstagramPostForm({
  initial,
  submitLabel,
  onSubmit,
  onClose,
  events,
  showPostedDate = false,
}: {
  initial: PostDraft;
  submitLabel: string;
  onSubmit: (d: PostDraft) => void;
  onClose: () => void;
  /** Calendar events the post can optionally be linked to. */
  events?: PostFormEvent[];
  /** Show the "Posting Date" field. Only meaningful once a post is posted. */
  showPostedDate?: boolean;
}) {
  const [form, setForm] = useState<PostDraft>(initial);

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.title.trim() || !form.dueDate) return;
    onSubmit({ ...form, title: form.title.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <FieldLabel tone="dusk">Post Title *</FieldLabel>
        <input
          required
          className={inputDuskCls}
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Meet the Bros Reel"
        />
      </div>
      <div>
        <FieldLabel tone="dusk">Due Date *</FieldLabel>
        <input
          required
          type="date"
          className={inputDuskCls}
          value={form.dueDate}
          onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
        />
        <p className="mt-1 text-[11px] text-[#8a8474]">The planned date — drives urgency and the calendar.</p>
      </div>
      {showPostedDate && (
        <div>
          <FieldLabel tone="dusk">Posting Date</FieldLabel>
          <input
            type="date"
            className={inputDuskCls}
            value={form.postedDate ?? ""}
            onChange={e => setForm(f => ({ ...f, postedDate: e.target.value || null }))}
          />
          <p className="mt-1 text-[11px] text-[#8a8474]">The day it actually went live.</p>
        </div>
      )}
      <div>
        <FieldLabel tone="dusk">Type</FieldLabel>
        <select
          className={inputDuskCls}
          value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value as InstagramType }))}
        >
          {INSTAGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {events && events.length > 0 && (
        <div>
          <FieldLabel tone="dusk">Linked event (optional)</FieldLabel>
          <select
            className={inputDuskCls}
            value={form.calendarEventId ?? ""}
            onChange={e =>
              setForm(f => ({ ...f, calendarEventId: e.target.value ? Number(e.target.value) : null }))
            }
          >
            <option value="">— None —</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.title} · {ev.date}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[rgba(236,231,221,0.12)] bg-[#161310] px-4 py-1.5 text-[13px] text-[#c9c2b4] transition-colors hover:border-[rgba(236,231,221,0.22)] hover:text-[#ece7dd]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[#a78bfa] px-4 py-1.5 text-[13px] font-semibold text-[#1a1206] transition-colors hover:bg-[#b9a0fb]"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
