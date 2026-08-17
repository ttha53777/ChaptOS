"use client";

/**
 * Wrapping an event up — the Confirmed → Done step.
 *
 * Every other gate asks for something the event is MISSING. This one isn't:
 * a confirmed event already carries everything the model requires, so the step
 * asks the only question left, which is how it went. Both answers are optional —
 * a chapter that never rates anything should still be able to close events out —
 * but asking at the moment of wrapping is the one time anybody remembers.
 *
 * The rating is a real radiogroup. The obvious implementation (mark every star
 * up to N as checked) reports four selected radios in a group of five to a
 * screen reader; `aria-checked` therefore tracks the EXACT star while the glyph
 * fill tracks the run up to it.
 */

import { useState } from "react";
import { Modal } from "../dashboard/primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "../dashboard/styles";
import type { ProgrammingTask } from "../../data";
import { STAGE_LABELS } from "@/lib/state/programming-stage";

export const RATING_LABELS: Record<number, string> = {
  1: "Rough",
  2: "Okay",
  3: "Good",
  4: "Great",
  5: "Legendary",
};

const MAX_NOTES = 500;

/**
 * Five stars as a proper radiogroup.
 *
 * Clicking the star that's already selected clears the rating — without it,
 * a mis-click on a five-point scale is unrecoverable without a separate
 * "clear" affordance nobody looks for.
 */
export function StarRadioGroup({
  value,
  onChange,
  disabled,
  size = 26,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  disabled?: boolean;
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value;
  return (
    <div role="radiogroup" aria-label="How it went" className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          // Only the exact star is checked. Marking n <= value would announce
          // four selected options in a group where one can be selected.
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""} — ${RATING_LABELS[n]}`}
          disabled={disabled}
          onClick={() => onChange?.(value === n ? null : n)}
          onMouseEnter={() => !disabled && setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          style={{ fontSize: size }}
          className={`leading-none transition-transform duration-75 ${
            disabled ? "cursor-default" : "cursor-pointer hover:scale-110"
          } ${display != null && n <= display ? "text-[#ddb36a]" : "text-[#3a352d]"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function EventWrapUp({
  event,
  onCancel,
  onCommit,
}: {
  event: ProgrammingTask;
  onCancel: () => void;
  onCommit: (patch: { successRating: number | null; wrapUpNotes: string | null }) => Promise<void>;
}) {
  const [stars, setStars] = useState<number | null>(event.successRating ?? null);
  const [notes, setNotes] = useState(event.wrapUpNotes ?? "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (saving) return;
    setSaving(true);
    try {
      await onCommit({ successRating: stars, wrapUpNotes: notes.trim() || null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal tone="dusk" title="Wrap it up" onClose={onCancel} maxWidthClass="max-w-lg">
      <div className="ev-ov space-y-4">
        <p className="ev-ov-sub">
          Nothing here is required — but this is the one moment anybody still remembers how it went.
        </p>
        <p className="ev-ov-lead truncate">
          <span className="k">Event:</span> {event.title}
        </p>

        <div className="space-y-2">
          <label className="ev-ov-lbl block">How did it go?</label>
          <div className="flex items-center gap-3">
            <StarRadioGroup value={stars} onChange={setStars} />
            <span className="ev-ov-sub">
              {stars != null ? RATING_LABELS[stars] : "No rating yet"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="wrapup-notes" className="ev-ov-lbl block">
            Anything worth remembering next time?
          </label>
          <textarea
            id="wrapup-notes"
            rows={4}
            maxLength={MAX_NOTES}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What worked, what to do differently, who to call again."
            className={`${inputDuskCls} resize-none`}
          />
          <p className="ev-ov-hint text-right">{notes.length}/{MAX_NOTES}</p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="ev-ov-cancel"
          >
            {/* Names the lane you'd be left in rather than a bare "Cancel" — the
                event is mid-move, so "back out" has to say back out to WHERE. */}
            Leave in {STAGE_LABELS[event.stage]}
          </button>
          <button type="button" onClick={commit} disabled={saving} className={`${btnDuskPrimaryCls} w-auto`}>
            {saving ? "Saving…" : "Mark it done"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
