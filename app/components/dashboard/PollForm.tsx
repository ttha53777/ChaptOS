"use client";

import React, { useMemo, useState } from "react";
import type { Brother } from "../../data";
import { FieldLabel } from "./primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "./styles";
import type { RoleOption } from "./TaskForm";

// What the caller receives on submit — the parent owns the POST/PATCH + optimistic
// list update (mirrors TaskForm).
export type PollFormValue = {
  title: string;
  question: string;
  closeDate: string; // ISO YYYY-MM-DD or "" (no date)
  options: string[]; // 2-10 trimmed, non-empty labels
  assigneeBrotherIds: number[];
  assigneeRoleIds: number[];
};

type AssignMode = "individuals" | "roles" | "everyone";

const MODES: { key: AssignMode; label: string }[] = [
  { key: "individuals", label: "Individuals" },
  { key: "roles",       label: "Roles" },
  { key: "everyone",    label: "Everyone" },
];

export type PollFormInitial = {
  title: string;
  question: string;
  closeDate: string;
  options: string[];
  brotherIds: number[];
  roleIds: number[];
};

const EMPTY: PollFormInitial = { title: "", question: "", closeDate: "", options: ["", ""], brotherIds: [], roleIds: [] };

const MAX_OPTIONS = 10;

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

/**
 * Shared create/edit poll form. Mirrors TaskForm's assignee UX (Individuals /
 * Roles / Everyone) but swaps notes for a question + a dynamic 2-10 options list.
 * When `optionsLocked` is set (the poll already has votes), the options list is
 * read-only — changing options would orphan votes (enforced server-side too).
 */
export function PollForm({
  brothers, roles, initial, submitLabel, minDate, maxDate, error, optionsLocked, onSubmit,
}: {
  brothers: Brother[];
  roles: RoleOption[];
  initial?: PollFormInitial;
  submitLabel: string;
  minDate?: string;
  maxDate?: string;
  error?: string | null;
  optionsLocked?: boolean;
  onSubmit: (value: PollFormValue) => void;
}) {
  const init = initial ?? EMPTY;
  const [title,      setTitle]      = useState(init.title);
  const [question,   setQuestion]   = useState(init.question);
  const [closeDate,  setCloseDate]  = useState(init.closeDate);
  const [options,    setOptions]    = useState<string[]>(init.options.length >= 2 ? init.options : ["", ""]);
  const [brotherIds, setBrotherIds] = useState<number[]>(init.brotherIds);
  const [roleIds,    setRoleIds]    = useState<number[]>(init.roleIds);
  const [mode, setMode] = useState<AssignMode>(init.roleIds.length > 0 ? "roles" : "individuals");
  const [localError, setLocalError] = useState<string | null>(null);

  const everyoneCount = brothers.length;
  const shownError = localError ?? error ?? null;

  const resolved = useMemo((): { brotherIds: number[]; roleIds: number[] } => {
    if (mode === "everyone")    return { brotherIds: brothers.map(b => b.id), roleIds: [] };
    if (mode === "roles")       return { brotherIds: [], roleIds };
    return { brotherIds, roleIds: [] };
  }, [mode, brothers, brotherIds, roleIds]);

  function setOption(i: number, value: string) {
    setOptions(opts => opts.map((o, idx) => (idx === i ? value : o)));
  }
  function addOption() {
    setOptions(opts => (opts.length >= MAX_OPTIONS ? opts : [...opts, ""]));
  }
  function removeOption(i: number) {
    setOptions(opts => (opts.length <= 2 ? opts : opts.filter((_, idx) => idx !== i)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setLocalError("A poll needs a title."); return; }
    if (!question.trim()) { setLocalError("A poll needs a question."); return; }
    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (!optionsLocked && cleanOptions.length < 2) { setLocalError("Add at least two options."); return; }
    if (resolved.brotherIds.length + resolved.roleIds.length === 0) {
      setLocalError(mode === "everyone" ? "There are no members to assign yet." : "Assign at least one member or role.");
      return;
    }
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      question: question.trim(),
      closeDate,
      options: cleanOptions,
      assigneeBrotherIds: resolved.brotherIds,
      assigneeRoleIds: resolved.roleIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="tk-form">
      <div>
        <FieldLabel htmlFor="pl-title" tone="dusk">Title</FieldLabel>
        <input id="pl-title" className={inputDuskCls} value={title} autoFocus
          onChange={e => setTitle(e.target.value)} placeholder="What's this poll about…" />
      </div>

      <div>
        <FieldLabel htmlFor="pl-question" tone="dusk">Question</FieldLabel>
        <input id="pl-question" className={inputDuskCls} value={question}
          onChange={e => setQuestion(e.target.value)} placeholder="What are you asking?" />
      </div>

      <div>
        <FieldLabel tone="dusk">
          Options{" "}
          <span className="tk-opt">(2–{MAX_OPTIONS}{optionsLocked ? " · locked, voting has started" : ""})</span>
        </FieldLabel>
        <div className="pl-options">
          {options.map((opt, i) => (
            <div key={i} className="pl-option-row">
              <input className={inputDuskCls} value={opt} disabled={optionsLocked}
                placeholder={`Option ${i + 1}`}
                onChange={e => setOption(i, e.target.value)} />
              {!optionsLocked && options.length > 2 && (
                <button type="button" className="pl-option-del" title="Remove option"
                  aria-label="Remove option" onClick={() => removeOption(i)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {!optionsLocked && options.length < MAX_OPTIONS && (
          <button type="button" className="pl-option-add" onClick={addOption}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
            Add option
          </button>
        )}
      </div>

      <div>
        <FieldLabel htmlFor="pl-close" tone="dusk">Close date <span className="tk-opt">(optional — a dated poll shows on the timeline)</span></FieldLabel>
        <input id="pl-close" type="date" className={inputDuskCls} value={closeDate} min={minDate} max={maxDate}
          onChange={e => setCloseDate(e.target.value)} />
      </div>

      <div>
        <FieldLabel tone="dusk">Ask</FieldLabel>
        <div className="inline-flex overflow-hidden rounded-lg border border-[rgba(236,231,221,0.12)]">
          {MODES.map(m => (
            <button key={m.key} type="button"
              aria-pressed={mode === m.key}
              onClick={() => { setMode(m.key); setLocalError(null); }}
              className={`px-3.5 py-2 text-[11px] font-medium tracking-wide transition-colors ${
                mode === m.key
                  ? "bg-[#a78bfa] text-[#0f0d0a]"
                  : "text-[#958d7c] hover:text-[#ece7dd] hover:bg-[rgba(236,231,221,0.06)]"
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === "individuals" && (
          <div className="tk-picker">
            {brothers.length === 0 && <span className="tk-opt">No members yet.</span>}
            {brothers.map(b => (
              <button key={b.id} type="button"
                className={`tk-pick-chip${brotherIds.includes(b.id) ? " on" : ""}`}
                onClick={() => setBrotherIds(ids => toggleId(ids, b.id))}>
                {b.name}
              </button>
            ))}
          </div>
        )}

        {mode === "roles" && (
          <>
            <div className="tk-picker">
              {roles.length === 0 && <span className="tk-opt">No roles defined.</span>}
              {roles.map(r => (
                <button key={r.id} type="button"
                  className={`tk-pick-chip role${roleIds.includes(r.id) ? " on" : ""}`}
                  style={r.color ? { ["--chip" as string]: r.color } : undefined}
                  onClick={() => setRoleIds(ids => toggleId(ids, r.id))}>
                  {r.name}
                </button>
              ))}
            </div>
            <p className="tk-opt" style={{ marginTop: 6 }}>Roles expand to their current holders.</p>
          </>
        )}

        {mode === "everyone" && (
          <p className="tk-opt" style={{ marginTop: 8 }}>
            {everyoneCount > 0
              ? `All ${everyoneCount} ${everyoneCount === 1 ? "member" : "members"} can vote.`
              : "There are no members to assign yet."}
          </p>
        )}
      </div>

      {shownError && <p className="tk-form-error">{shownError}</p>}

      <button type="submit" className={btnDuskPrimaryCls}>{submitLabel}</button>
    </form>
  );
}
