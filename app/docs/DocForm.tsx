"use client";

import { useState } from "react";
import { FieldLabel } from "../components/dashboard/primitives";
import { inputCls } from "../components/dashboard/styles";

export type DocDraft = { title: string; url: string; description: string };

export function DocForm({
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  initial: DocDraft;
  submitLabel: string;
  onSubmit: (d: DocDraft) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DocDraft>(initial);
  const set = (k: keyof DocDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <form
      onSubmit={ev => { ev.preventDefault(); onSubmit(form); }}
      className="space-y-3"
    >
      <div>
        <FieldLabel>Title *</FieldLabel>
        <input
          required
          className={inputCls}
          value={form.title}
          onChange={set("title")}
          placeholder="Chapter Constitution"
        />
      </div>
      <div>
        <FieldLabel>URL *</FieldLabel>
        <input
          required
          type="url"
          className={inputCls}
          value={form.url}
          onChange={set("url")}
          placeholder="https://docs.google.com/document/d/…"
        />
      </div>
      <div>
        <FieldLabel>Description</FieldLabel>
        <textarea
          className={`${inputCls} min-h-[72px] resize-y`}
          value={form.description}
          onChange={set("description")}
          placeholder="Short note about what this is for"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
