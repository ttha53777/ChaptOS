"use client";

import { useState } from "react";
import { FieldLabel } from "../../components/dashboard/primitives";
import { inputDuskCls } from "../../components/dashboard/styles";

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
        <FieldLabel tone="dusk">Title *</FieldLabel>
        <input
          required
          className={inputDuskCls}
          value={form.title}
          onChange={set("title")}
          placeholder="Chapter Constitution"
        />
      </div>
      <div>
        <FieldLabel tone="dusk">URL *</FieldLabel>
        <input
          required
          type="url"
          className={inputDuskCls}
          value={form.url}
          onChange={set("url")}
          placeholder="https://docs.google.com/document/d/…"
        />
      </div>
      <div>
        <FieldLabel tone="dusk">Description</FieldLabel>
        <textarea
          className={`${inputDuskCls} min-h-[72px] resize-y`}
          value={form.description}
          onChange={set("description")}
          placeholder="Short note about what this is for"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[rgba(var(--ink-rgb),0.12)] bg-[color:var(--card)] px-4 py-1.5 text-[13px] text-[color:var(--ink-soft)] transition-colors hover:border-[rgba(var(--ink-rgb),0.22)] hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[color:var(--vio)] px-4 py-1.5 text-[13px] font-semibold text-[color:var(--paper)] transition-colors hover:bg-[color:var(--vio-hi)]"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
