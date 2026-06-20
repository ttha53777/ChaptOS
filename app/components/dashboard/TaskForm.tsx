"use client";

import React, { useMemo, useState } from "react";
import type { Brother } from "../../data";
import { FieldLabel } from "./primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "./styles";

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
};

// The assignment target is a single mutually-exclusive mode, matching the
// "choose either individuals, roles, or everyone" UX. "Everyone" carries no
// stored flag: it expands to every current member id at submit time.
type AssignMode = "individuals" | "roles" | "everyone";

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
};

const EMPTY: TaskFormInitial = { title: "", dueDate: "", notes: "", brotherIds: [], roleIds: [] };

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

/**
 * Shared create/edit task form. Lives in a `<Modal tone="dusk">` on the tasks
 * page and the dashboard alike, so it carries its own (portable) styling rather
 * than depending on the `.dash.dash-tasks`-scoped `.tk-seg` rules.
 */
export function TaskForm({
  brothers, roles, initial, submitLabel, minDate, maxDate, error, onSubmit,
}: {
  brothers: Brother[];
  roles: RoleOption[];
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
  // Editing: infer the mode from existing assignments (roles present → Roles).
  // New tasks default to Individuals.
  const [mode, setMode] = useState<AssignMode>(init.roleIds.length > 0 ? "roles" : "individuals");
  const [localError, setLocalError] = useState<string | null>(null);

  const everyoneCount = brothers.length;
  const shownError = localError ?? error ?? null;

  // The effective assignee arrays for the current mode — only the active mode
  // contributes, so switching modes doesn't silently carry the other's picks.
  const resolved = useMemo((): { brotherIds: number[]; roleIds: number[] } => {
    if (mode === "everyone")    return { brotherIds: brothers.map(b => b.id), roleIds: [] };
    if (mode === "roles")       return { brotherIds: [], roleIds };
    return { brotherIds, roleIds: [] };
  }, [mode, brothers, brotherIds, roleIds]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setLocalError("A task needs a title."); return; }
    if (resolved.brotherIds.length + resolved.roleIds.length === 0) {
      setLocalError(mode === "everyone" ? "There are no members to assign yet." : "Assign at least one member or role.");
      return;
    }
    setLocalError(null);
    onSubmit({
      title: title.trim(),
      dueDate,
      notes: notes.trim(),
      assigneeBrotherIds: resolved.brotherIds,
      assigneeRoleIds: resolved.roleIds,
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
              ? `All ${everyoneCount} ${everyoneCount === 1 ? "member" : "members"} will be assigned.`
              : "There are no members to assign yet."}
          </p>
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
