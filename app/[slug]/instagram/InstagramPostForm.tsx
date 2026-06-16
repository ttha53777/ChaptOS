"use client";

import { useState } from "react";
import { FieldLabel } from "../../components/dashboard/primitives";
import { inputDuskCls } from "../../components/dashboard/styles";
import type { InstagramType, TaskStatus } from "../../data";
import { INSTAGRAM_TYPES } from "@/lib/validation/instagram";

export type PostDraft = { title: string; dueDate: string; type: InstagramType; status: TaskStatus };

// Status the user can pick when planning. "Complete" is reached via "Mark
// posted", never set in the form (mirrors the old AddIGTaskForm).
const PLANNABLE_STATUSES: TaskStatus[] = ["Upcoming", "Due Soon", "Urgent"];

export function InstagramPostForm({
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  initial: PostDraft;
  submitLabel: string;
  onSubmit: (d: PostDraft) => void;
  onClose: () => void;
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
      </div>
      <div className="grid grid-cols-2 gap-3">
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
        <div>
          <FieldLabel tone="dusk">Status</FieldLabel>
          <select
            className={inputDuskCls}
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
          >
            {PLANNABLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
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
