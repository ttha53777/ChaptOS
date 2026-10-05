"use client";

import React, { useMemo, useState } from "react";
import type { Brother } from "../../data";
import { FieldLabel } from "./primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "./styles";
import "./task-form.css";

// A role summary for the assignee picker, from /api/roles (listRoles).
export type RoleOption = { id: number; name: string; color: string | null };

// What the caller receives on submit — the parent owns the POST/PATCH + optimistic
// list update so each call site keeps its own state in sync.
export type TaskFormValue = {
  title: string;
  dueDate: string; // ISO YYYY-MM-DD or "" (no date)
  notes: string;
  assigneeBrotherIds: number[];
  assigneeRoleIds: number[];
  /** Set when assigned to Everyone (the ids are then empty): who has to finish it. */
  everyone: TaskEveryoneMode | null;
};

// "any" = one person finishes it for the whole chapter; "each" = every member
// does it and ticks their own. Mirrors TaskEveryone in @/lib/state.
export type TaskEveryoneMode = "any" | "each";

// The assignment target is a single mutually-exclusive mode, matching the
// "choose either individuals, roles, or everyone" UX. "Everyone" is a live
// target on the task, not a snapshot — members who join later get it too.
type AssignMode = "individuals" | "roles" | "everyone";

const EVERYONE_CHOICES: { key: TaskEveryoneMode; label: string; hint: string }[] = [
  { key: "each", label: "Every member does it", hint: "Each person ticks off their own. It’s done when everyone has." },
  { key: "any",  label: "One person does it",   hint: "Anyone can pick it up. The first to finish ticks it off for the chapter." },
];

const MODES: { key: AssignMode; label: string }[] = [
  { key: "individuals", label: "Individuals" },
  { key: "roles",       label: "Roles" },
  { key: "everyone",    label: "Everyone" },
];

export type TaskFormInitial = {
  title: string;
  dueDate: string;
  notes: string;
  brotherIds: number[];
  roleIds: number[];
  everyone?: TaskEveryoneMode | null;
};

const EMPTY: TaskFormInitial = { title: "", dueDate: "", notes: "", brotherIds: [], roleIds: [], everyone: null };

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

/**
 * Shared create/edit task form. Lives in a `<Modal tone="dusk">` on the tasks
 * page and the dashboard alike, so it carries its own (portable) styling rather
 * than depending on the `.dash.dash-tasks`-scoped `.tk-seg` rules.
 */
export function TaskForm({
  brothers, roles, brothersLoading, rolesLoading, initial, submitLabel, minDate, maxDate, error, onSubmit,
}: {
  brothers: Brother[];
  roles: RoleOption[];
  /** True while `brothers` is still in flight — an empty array means "not loaded yet", not "no members". */
  brothersLoading?: boolean;
  /** True while `roles` is still in flight — an empty array means "not loaded yet", not "no roles". */
  rolesLoading?: boolean;
  initial?: TaskFormInitial;
  submitLabel: string;
  minDate?: string;
  maxDate?: string;
  /** An error surfaced by the parent (e.g. a failed save). */
  error?: string | null;
  onSubmit: (value: TaskFormValue) => void;
}) {
  const init = initial ?? EMPTY;
  const [title,      setTitle]      = useState(init.title);
  const [dueDate,    setDueDate]    = useState(init.dueDate);
  const [notes,      setNotes]      = useState(init.notes);
  const [brotherIds, setBrotherIds] = useState<number[]>(init.brotherIds);
  const [roleIds,    setRoleIds]    = useState<number[]>(init.roleIds);
  // Editing: infer the mode from the task (Everyone flag, else roles present →
  // Roles). New tasks default to Individuals.
  const [mode, setMode] = useState<AssignMode>(init.everyone ? "everyone" : init.roleIds.length > 0 ? "roles" : "individuals");
  // No default: "every member" vs "one person" changes what done means, so the
  // officer says which out loud.
  const [everyoneMode, setEveryoneMode] = useState<TaskEveryoneMode | null>(init.everyone ?? null);
  const [localError, setLocalError] = useState<string | null>(null);

  const everyoneCount = brothers.length;
  const shownError = localError ?? error ?? null;

  // The effective assignee arrays for the current mode — only the active mode
  // contributes, so switching modes doesn't silently carry the other's picks.
  const resolved = useMemo((): { brotherIds: number[]; roleIds: number[] } => {
    if (mode === "everyone")    return { brotherIds: [], roleIds: [] };
    if (mode === "roles")       return { brotherIds: [], roleIds };
    return { brotherIds, roleIds: [] };
  }, [mode, brotherIds, roleIds]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setLocalError("A task needs a title."); return; }
    if (mode === "everyone" && !everyoneMode) {
      setLocalError("Say whether every member does it, or one person does it for the chapter.");
      return;
    }
    if (mode !== "everyone" && resolved.brotherIds.length + resolved.roleIds.length === 0) {
      setLocalError("Assign at least one member or role.");
      return;
    }
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      dueDate,
      notes: notes.trim(),
      assigneeBrotherIds: resolved.brotherIds,
      assigneeRoleIds: resolved.roleIds,
      everyone: mode === "everyone" ? everyoneMode : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="tk-form">
      <div>
        <FieldLabel htmlFor="tk-title" tone="dusk">Title</FieldLabel>
        <input id="tk-title" className={inputDuskCls} value={title} autoFocus
          onChange={e => setTitle(e.target.value)} placeholder="What needs doing…" />
      </div>

      <div>
        <FieldLabel htmlFor="tk-due" tone="dusk">Due date <span className="tk-opt">(optional — a dated task shows on the timeline)</span></FieldLabel>
        <input id="tk-due" type="date" className={inputDuskCls} value={dueDate} min={minDate} max={maxDate}
          onChange={e => setDueDate(e.target.value)} />
      </div>

      <div>
        <FieldLabel tone="dusk">Assign to</FieldLabel>
        {/* Self-contained segmented toggle (portable across tasks page + dashboard). */}
        <div className="ui-seg inline-flex overflow-hidden rounded-lg border border-[rgba(var(--ink-rgb),0.12)]">
          {MODES.map(m => (
            <button key={m.key} type="button"
              aria-pressed={mode === m.key}
              onClick={() => { setMode(m.key); setLocalError(null); }}
              className={`px-3.5 py-2 text-[11px] font-medium tracking-wide transition-colors ${
                mode === m.key
                  ? "bg-[color:var(--vio)] text-[color:var(--paper)]"
                  : "text-[color:var(--muted)] hover:text-[color:var(--ink)] hover:bg-[rgba(var(--ink-rgb),0.06)]"
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === "individuals" && (
          <div className="tk-picker">
            {brothers.length === 0 && (
              <span className="tk-opt">{brothersLoading ? "Loading members…" : "No members yet."}</span>
            )}
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
              {roles.length === 0 && (
                <span className="tk-opt">{rolesLoading ? "Loading roles…" : "No roles defined."}</span>
              )}
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
          <>
            <div className="tk-everyone" role="radiogroup" aria-label="Who has to do it">
              {EVERYONE_CHOICES.map(c => (
                <button key={c.key} type="button" role="radio" aria-checked={everyoneMode === c.key}
                  className={`tk-ev-opt${everyoneMode === c.key ? " on" : ""}`}
                  onClick={() => { setEveryoneMode(c.key); setLocalError(null); }}>
                  <span className="tk-ev-dot" aria-hidden />
                  <span className="tk-ev-txt"><b>{c.label}</b><small>{c.hint}</small></span>
                </button>
              ))}
            </div>
            <p className="tk-opt" style={{ marginTop: 8 }}>
              {brothersLoading
                ? "Loading members…"
                : everyoneCount <= 1
                  ? "Just you for now — everyone who joins gets it too."
                  : `All ${everyoneCount} members, and anyone who joins later.`}
            </p>
          </>
        )}
      </div>

      <div>
        <FieldLabel htmlFor="tk-notes" tone="dusk">Notes <span className="tk-opt">(optional)</span></FieldLabel>
        <textarea id="tk-notes" className={inputDuskCls} rows={2} value={notes}
          onChange={e => setNotes(e.target.value)} />
      </div>

      {shownError && <p className="tk-form-error">{shownError}</p>}

      <button type="submit" className={btnDuskPrimaryCls}>{submitLabel}</button>
    </form>
  );
}
