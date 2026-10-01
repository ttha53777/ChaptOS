"use client";

import React from "react";

// Small presentational pieces shared by the member card's sections. No state and
// no fetching here: MemberSpotlight owns every edit and every write.

export const Icon = {
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 18L18 6M6 6l12 12" /></svg>
  ),
  left: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
  ),
  right: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
  ),
  xs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden><path d="M6 18L18 6M6 6l12 12" /></svg>
  ),
};

/** The editor state every popover reads from. */
export interface EditApi {
  editing: string | null;
  draft: Record<string, string>;
  saving: boolean;
  error: string | null;
  /** Open `key`'s popover, or close it if it's already open. Asks first if the open edit is dirty. */
  toggle: (key: string) => void;
  set: (field: string, value: string) => void;
  save: () => void;
  cancel: () => void;
  /** Run a one-click action (approve, add role, copy…), asking first if an edit is dirty. */
  act: (fn: () => void) => void;
}

export function Pop({ label, cls = "", children }: { label: string; cls?: string; children: React.ReactNode }) {
  return (
    <div className={`ms-pop ${cls}`} role="dialog" aria-label={label} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  );
}

export function Hint({ edit, text }: { edit: EditApi; text?: string }) {
  if (!edit.error && !text) return null;
  return (
    <p className={`hint ${edit.error ? "err" : ""}`} id="ms-ed-hint" role={edit.error ? "alert" : undefined}>
      {edit.error ?? text}
    </p>
  );
}

export function SaveFoot({ edit, label = "Save", tone = "primary", extra, disabled }: {
  edit: EditApi; label?: string; tone?: "primary" | "danger"; extra?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div className="foot">
      {extra}
      <span className="sp">
        <button type="button" className="ms-btn ghost" onClick={edit.cancel}>Cancel</button>
        <button type="button" className={`ms-btn ${tone}`} onClick={edit.save} disabled={edit.saving || disabled}>
          {edit.saving ? <><span className="ms-spin" /> Saving</> : label}
        </button>
      </span>
    </div>
  );
}

export function DoneFoot({ edit, extra }: { edit: EditApi; extra?: React.ReactNode }) {
  return (
    <div className="foot">
      {extra}
      <span className="sp"><button type="button" className="ms-btn ghost" onClick={edit.cancel}>Done</button></span>
    </div>
  );
}

/** A text/number field bound to draft.value, focused on open. */
export function DraftInput({ edit, field = "value", label, numeric, wide = true, placeholder, step, max }: {
  edit: EditApi; field?: string; label: string; numeric?: boolean; wide?: boolean; placeholder?: string; step?: string; max?: number;
}) {
  return (
    <input
      autoFocus
      className={wide ? "wide" : "num"}
      type={numeric ? "number" : "text"}
      inputMode={numeric ? "decimal" : undefined}
      min={numeric ? 0 : undefined}
      max={max}
      step={step}
      value={edit.draft[field] ?? ""}
      placeholder={placeholder}
      onChange={e => edit.set(field, e.target.value)}
      onFocus={e => { if (numeric) e.currentTarget.select(); }}
      aria-label={label}
      aria-describedby="ms-ed-hint"
      aria-invalid={!!edit.error}
    />
  );
}

/** One of the four numbers. The button opens its detail popover. */
export function Stat({ id, label, value, valueCls = "", caption, edit, align = "", children }: {
  id: string; label: string; value: string; valueCls?: string; caption: string; edit: EditApi; align?: string; children?: React.ReactNode;
}) {
  const open = edit.editing === id || (id === "att" && edit.editing === "exempt");
  return (
    <div className="ms-stat">
      <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => edit.toggle(id)}>
        <span className="k">{label}<span className="go" aria-hidden>›</span></span>
        <span className={`n ${valueCls}`}>{value}</span>
        <span className="c">{caption}</span>
      </button>
      {open && children && <Pop label={label} cls={align}>{children}</Pop>}
    </div>
  );
}

/** A label/value row in About. `editor` renders inside the popover when the row is open. */
export function Row({ id, label, value, valueCls = "", title, edit, editable, plain, action, editor }: {
  id: string; label: React.ReactNode; value: React.ReactNode; valueCls?: string; title?: string; edit: EditApi;
  editable?: boolean; plain?: string; action?: React.ReactNode; editor?: () => React.ReactNode;
}) {
  const on = edit.editing === id;
  const name = plain ?? (typeof label === "string" ? label : id);
  return (
    <div className={`ms-row ${on ? "on" : ""}`}>
      <span className="k">{label}</span>
      <span className={`v ${valueCls}`} title={title}>{value}</span>
      {action ?? (editable && !on
        ? <button type="button" className="ms-tact quiet e" onClick={() => edit.toggle(id)} aria-label={`Edit ${name}`}>Edit</button>
        : <span />)}
      {on && editor && <Pop label={`Edit ${name}`} cls="up right">{editor()}</Pop>}
    </div>
  );
}
