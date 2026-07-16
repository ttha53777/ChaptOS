"use client";

import React, { useMemo, useState } from "react";
import type { Brother } from "../../data";
import type { RoleOption } from "./TaskForm";

// What the caller receives on submit — the parent owns the POST/PATCH + optimistic
// list update (mirrors TaskForm).
export type PollFormValue = {
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
  question: string;
  closeDate: string;
  options: string[];
  brotherIds: number[];
  roleIds: number[];
};

const EMPTY: PollFormInitial = { question: "", closeDate: "", options: ["", ""], brotherIds: [], roleIds: [] };

const MAX_OPTIONS = 10;

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

/**
 * Shared create/edit poll form — the compositional twin of the ballot voters see.
 * It borrows the editorial-ballot grammar from `.db-poll` (tasks-ledger.css): the
 * question is drafted in the same serif it's read in, options are laid out as
 * ballot lines with a radio marker, and micro-labels are mono uppercase. Mirrors
 * TaskForm's assignee UX (Individuals / Roles / Everyone). When `optionsLocked`
 * is set (the poll already has votes), the options list is read-only — changing
 * options would orphan votes (enforced server-side too).
 *
 * Rendered inside a `<Modal tone="dusk" hideHeader>` so the composer owns its own
 * head (a mono kicker + the serif question), matching the poll view modal.
 */
export function PollForm({
  brothers, roles, initial, kicker = "New ballot", submitLabel, minDate, maxDate, error, optionsLocked, onSubmit,
}: {
  brothers: Brother[];
  roles: RoleOption[];
  initial?: PollFormInitial;
  /** Mono uppercase eyebrow above the question (e.g. "New ballot" / "Editing ballot"). */
  kicker?: string;
  submitLabel: string;
  minDate?: string;
  maxDate?: string;
  error?: string | null;
  optionsLocked?: boolean;
  onSubmit: (value: PollFormValue) => void;
}) {
  const init = initial ?? EMPTY;
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
    if (!question.trim()) { setLocalError("A poll needs a question."); return; }
    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (!optionsLocked && cleanOptions.length < 2) { setLocalError("Add at least two options."); return; }
    if (resolved.brotherIds.length + resolved.roleIds.length === 0) {
      setLocalError(mode === "everyone" ? "There are no members to assign yet." : "Assign at least one member or role.");
      return;
    }
    setLocalError(null);
    onSubmit({
      question: question.trim(),
      closeDate,
      options: cleanOptions,
      assigneeBrotherIds: resolved.brotherIds,
      assigneeRoleIds: resolved.roleIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="pc">
      {/* Head — mono kicker + the question drafted in the ballot's serif. */}
      <p className="pc-kicker">{kicker}</p>
      <div className="pc-qwrap">
        <input id="pl-question" className="pc-question" value={question} autoFocus spellCheck={false}
          onChange={e => setQuestion(e.target.value)} placeholder="What are you asking?"
          aria-label="Poll question" />
      </div>

      {/* Options — ballot lines: radio marker + label + hairline. */}
      <div className="pc-section">
        <p className="pc-label">
          The options
          <span className={`pc-hint${optionsLocked ? " lock" : ""}`}>
            {optionsLocked ? "locked · voting has started" : `2–${MAX_OPTIONS}`}
          </span>
        </p>
        <div className="pc-options">
          {options.map((opt, i) => (
            <div key={i} className="pc-opt">
              <span className="pc-marker" aria-hidden><span className="pc-radio" /></span>
              <input className="pc-opt-input" value={opt} disabled={optionsLocked}
                placeholder={`Option ${i + 1}`}
                onChange={e => setOption(i, e.target.value)} />
              {!optionsLocked && options.length > 2 && (
                <button type="button" className="pc-opt-del" title="Remove option"
                  aria-label="Remove option" onClick={() => removeOption(i)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {!optionsLocked && options.length < MAX_OPTIONS && (
          <button type="button" className="pc-add" onClick={addOption}>
            <span className="pc-marker" aria-hidden>
              <span className="pc-add-glyph">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
              </span>
            </span>
            <span className="pc-add-lbl">Add an option</span>
          </button>
        )}
      </div>

      {/* Who votes — segmented mode toggle + chip picker (mirrors TaskForm). */}
      <div className="pc-section">
        <p className="pc-label">Who votes</p>
        <div className="pc-seg">
          {MODES.map(m => (
            <button key={m.key} type="button"
              aria-pressed={mode === m.key}
              className={mode === m.key ? "on" : ""}
              onClick={() => { setMode(m.key); setLocalError(null); }}>
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
            <p className="pc-note">Roles expand to their current holders.</p>
          </>
        )}

        {mode === "everyone" && (
          <p className="pc-note">
            {everyoneCount > 0
              ? `All ${everyoneCount} ${everyoneCount === 1 ? "member" : "members"} can vote.`
              : "There are no members to assign yet."}
          </p>
        )}
      </div>

      {/* Closes — optional; a dated poll rides the timeline. */}
      <div className="pc-section">
        <p className="pc-label">Closes <span className="pc-hint">optional</span></p>
        <input id="pl-close" type="date" className="pc-date" value={closeDate} min={minDate} max={maxDate}
          onChange={e => setCloseDate(e.target.value)} aria-label="Close date" />
        <p className="pc-note">A dated poll appears on the timeline.</p>
      </div>

      {shownError && <p className="pc-error">{shownError}</p>}

      <button type="submit" className="pc-submit">{submitLabel}</button>
    </form>
  );
}
