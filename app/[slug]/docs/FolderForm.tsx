"use client";

import { useState } from "react";
import { FieldLabel } from "../../components/dashboard/primitives";
import { inputDuskCls } from "../../components/dashboard/styles";

export function FolderForm({
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);

  return (
    <form
      onSubmit={ev => { ev.preventDefault(); onSubmit(name); }}
      className="space-y-3"
    >
      <div>
        <FieldLabel tone="dusk">Folder name *</FieldLabel>
        <input
          required
          autoFocus
          className={inputDuskCls}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Recruitment"
          maxLength={120}
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
