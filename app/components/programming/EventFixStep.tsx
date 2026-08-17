"use client";

/**
 * The one step between an event and the next lane.
 *
 * This opens ONLY when a forward move is blocked, and it collects exactly what
 * `missingFor` says is missing — nothing is hardcoded here, so an org that
 * changes what a lane costs changes this dialog for free. That is the whole
 * design: a gate that refuses you and a form that fixes it are the same moment,
 * and splitting them into a rejection plus a hunt for the right field is what
 * made the old flow feel arbitrary.
 *
 * It replaces PromoteDateModal, which asked only for a date — so a dateless AND
 * locationless event popped a date prompt and then still failed on the server.
 *
 * Edits stage in a local draft and are committed together on Continue. Cancelling
 * writes nothing: someone who backs out of confirming an event should not
 * discover later that half of it was saved anyway.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../dashboard/primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "../dashboard/styles";
import { OwnerPicker, type OwnerPatch, type RoleOption } from "./OwnerPicker";
import type { Brother, ProgrammingTask } from "../../data";
import { missingFor, type RequiredField } from "@/lib/programming";
import { initialsOf, type OwnerRef } from "@/lib/event-owner";
import { STAGE_LABELS, type ProgrammingStage } from "@/lib/state/programming-stage";

/** Just enough of a category to render one option. */
export interface FixTypeOption { slug: string; label: string }

/** What a staged answer looks like before it becomes an API patch. */
type Draft = {
  title?: string;
  category?: string;
  ownerBrotherId?: number | null;
  ownerRoleId?: number | null;
  dueDate?: string | null;
  location?: string | null;
  mandatory?: boolean;
};

/** Copy per gate. The two forward boundaries ask for different things and mean
 *  different things, so they should not share a generic "Complete this event". */
const GATE_COPY: Partial<Record<ProgrammingStage, {
  kicker: string; sub: string; go: string; cancel: string;
}>> = {
  planning: {
    kicker: "One step to start planning",
    sub: "Planning means somebody is accountable for this. That's all it costs.",
    go: "Start planning",
    cancel: "Leave as an idea",
  },
  confirmed: {
    kicker: "One step to confirm",
    sub: "Confirming publishes this to the whole chapter's calendar, so it needs a day and a place people can plan around.",
    go: "Confirm & publish",
    cancel: "Leave in Planning",
  },
};

/** Has this field been answered in the draft (falling back to the event)? */
function answered(f: RequiredField, draft: Draft, event: ProgrammingTask): boolean {
  switch (f.key) {
    case "title":     return (draft.title ?? event.title ?? "").trim().length > 0;
    case "category":  return (draft.category ?? event.category ?? "").trim().length > 0;
    case "owner":
      if (draft.ownerBrotherId !== undefined) return draft.ownerBrotherId !== null;
      if (draft.ownerRoleId !== undefined)    return draft.ownerRoleId !== null;
      return event.owner != null;
    case "date":      return !!(draft.dueDate !== undefined ? draft.dueDate : event.dueDate);
    case "location":  return ((draft.location !== undefined ? draft.location : event.location) ?? "").trim().length > 0;
    // A boolean is answered by existing — it is in the required set so the
    // publish decision visibly covers attendance, not so it can block.
    case "mandatory": return true;
  }
}

export function EventFixStep({
  event,
  stage,
  brothers,
  roles,
  eventTypes,
  onCancel,
  onCommit,
}: {
  event: ProgrammingTask;
  stage: ProgrammingStage;
  brothers: Brother[];
  roles: RoleOption[];
  eventTypes: FixTypeOption[];
  onCancel: () => void;
  onCommit: (patch: Draft, stage: ProgrammingStage) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  // The gaps are computed ONCE, on open. Recomputing as the draft fills would
  // make rows vanish under the cursor as they're answered — the list is the
  // agenda for this step, not a live readout.
  const gaps = useMemo(() => missingFor(event, stage), [event.id, stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = gaps.filter(f => !answered(f, draft, event)).length;
  const copy = GATE_COPY[stage] ?? {
    kicker: `One step to ${STAGE_LABELS[stage].toLowerCase()}`,
    sub: "This lane needs a little more first.",
    go: `Move to ${STAGE_LABELS[stage]}`,
    cancel: "Cancel",
  };

  // Focus the first UNANSWERED control, never the disabled Continue: the point
  // of opening here is to put the cursor on the thing that's blocking.
  const firstGapRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  useEffect(() => { firstGapRef.current?.focus(); }, []);

  const set = (patch: Draft) => setDraft(d => ({ ...d, ...patch }));

  async function commit() {
    if (left > 0 || saving) return;
    setSaving(true);
    try {
      await onCommit(draft, stage);
    } finally {
      setSaving(false);
    }
  }

  let assignedFocus = false;
  const focusRefFor = (f: RequiredField) => {
    if (assignedFocus || answered(f, draft, event)) return undefined;
    assignedFocus = true;
    return firstGapRef;
  };

  return (
    <Modal tone="dusk" title={copy.kicker} onClose={onCancel} maxWidthClass="max-w-lg">
      <div className="ev-ov space-y-3">
        <p className="ev-ov-sub">{copy.sub}</p>
        <p className="ev-ov-lead truncate">
          <span className="k">Event:</span> {event.title}
        </p>

        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]">
          {gaps.map(f => (
            <div key={f.key} className="px-3 py-3">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <label className="ev-ov-lbl">{f.label}</label>
                {answered(f, draft, event) && (
                  <span className="ev-ov-ok">Answered</span>
                )}
              </div>
              <p className="ev-ov-hint mb-2">{f.hint}</p>
              <GapEditor
                field={f}
                event={event}
                draft={draft}
                brothers={brothers}
                roles={roles}
                eventTypes={eventTypes}
                inputRef={focusRefFor(f)}
                onSet={set}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className={`ev-ov-remain${left === 0 ? " ready" : ""}`}>
            {left === 0 ? "All clear" : `${left} left`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="ev-ov-cancel"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={left > 0 || saving}
              className={`${btnDuskPrimaryCls} w-auto`}
            >
              {saving ? "Saving…" : copy.go}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** One editor, chosen by the field's declared `kind` rather than its key. */
function GapEditor({
  field, event, draft, brothers, roles, eventTypes, inputRef, onSet,
}: {
  field: RequiredField;
  event: ProgrammingTask;
  draft: Draft;
  brothers: Brother[];
  roles: RoleOption[];
  eventTypes: FixTypeOption[];
  inputRef?: React.RefObject<HTMLInputElement | HTMLSelectElement | null>;
  onSet: (patch: Draft) => void;
}) {
  if (field.kind === "person") {
    // The draft wins once it has touched either FK (including clearing one);
    // otherwise fall back to whatever the event already resolved to.
    const touched = draft.ownerBrotherId !== undefined || draft.ownerRoleId !== undefined;
    const picked = brothers.find(b => b.id === draft.ownerBrotherId);
    const pickedRole = roles.find(r => r.id === draft.ownerRoleId);
    const value: OwnerRef = !touched
      ? event.owner
      : picked
        ? { kind: "brother", id: picked.id, name: picked.name, initials: initialsOf(picked.name) }
        : pickedRole
          ? { kind: "role", id: pickedRole.id, name: pickedRole.name, holders: [] }
          : null;
    return (
      <OwnerPicker
        value={value}
        brothers={brothers}
        roles={roles}
        onChange={(p: OwnerPatch) =>
          onSet("ownerBrotherId" in p
            ? { ownerBrotherId: p.ownerBrotherId, ownerRoleId: null }
            : { ownerRoleId: p.ownerRoleId, ownerBrotherId: null })
        }
      />
    );
  }

  if (field.kind === "type") {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        className={inputDuskCls}
        value={draft.category ?? event.category ?? ""}
        onChange={e => onSet({ category: e.target.value })}
      >
        <option value="" className="ev-ov-opt">Pick a type…</option>
        {eventTypes.map(t => (
          <option key={t.slug} value={t.slug} className="ev-ov-opt">{t.label}</option>
        ))}
      </select>
    );
  }

  if (field.kind === "date") {
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="date"
        className={inputDuskCls}
        value={draft.dueDate ?? event.dueDate ?? ""}
        onChange={e => onSet({ dueDate: e.target.value || null })}
      />
    );
  }

  if (field.kind === "bool") {
    const on = draft.mandatory ?? event.mandatory ?? false;
    return (
      <div className="flex gap-2">
        {[true, false].map(v => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onSet({ mandatory: v })}
            className={`ev-ov-choice${on === v ? " on" : ""}`}
          >
            {v ? "Required of every member" : "Optional — no attendance taken"}
          </button>
        ))}
      </div>
    );
  }

  // text: title and location.
  const isTitle = field.key === "title";
  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      className={inputDuskCls}
      maxLength={isTitle ? 120 : 160}
      placeholder={isTitle ? "What to call it" : "Where it happens"}
      value={(isTitle ? draft.title ?? event.title : draft.location ?? event.location) ?? ""}
      onChange={e => onSet(isTitle ? { title: e.target.value } : { location: e.target.value })}
    />
  );
}
