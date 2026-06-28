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
