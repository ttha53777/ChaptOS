"use client";

/**
 * Turning a field's collection on or off, from the event you're looking at.
 *
 * This is an ORG-level write made from an event-scoped sheet, which is exactly
 * why the footnote below is not optional: without it, toggling "Risk form" here
 * reads as a property of this one event rather than a decision for every event
 * the chapter will ever run.
 *
 * Only the toggle lives here. Add, rename, delete and reorder are in Settings,
 * because those are decisions about the chapter's vocabulary rather than about
 * the thing in front of you — and because a rename made in passing from an event
 * sheet is a rename nobody else knows happened.
 */

import { useState } from "react";
import { apiErrorMessage, requestJson } from "../../../lib/api";
import type { EventFieldDef } from "@/lib/event-fields";

type Row = EventFieldDef & { id: number };

export function FieldTogglePills({
  fields,
  settingsHref,
  onChanged,
  onStatus,
  onError,
}: {
  fields: Row[];
  settingsHref: string;
  onChanged: () => void;
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);

  async function toggle(f: Row) {
    if (busy != null) return;
    setBusy(f.id);
    try {
      await requestJson(`/api/events/fields/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !f.enabled }),
      });
      onChanged();
      onStatus(
        f.enabled
          // The second half of this sentence is the OFF ≠ DELETE promise, and
          // it has to be said: an officer who thinks turning a field off throws
          // away a term of answers will never turn one off.
          ? `${f.label} is no longer collected. Existing answers are kept.`
          : `${f.label} is collected on every event again.`,
      );
    } catch (err) {
      onError(apiErrorMessage(err, "Could not change what's collected."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ev-fp">
      <div className="ev-fp-pills">
        {fields.map(f => (
          <button
            key={f.id}
            type="button"
            // A builtin's toggle is refused by the server, so it isn't offered:
            // a control that always fails teaches the wrong lesson.
            disabled={f.builtin || busy != null}
            aria-pressed={f.enabled}
            onClick={() => void toggle(f)}
            title={f.builtin ? "Built in — always collected. Rename it in Settings." : undefined}
            className={`ev-fp-pill${f.enabled ? " on" : ""}${f.builtin ? " locked" : ""}`}
          >
            {f.builtin && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 018 0v4" />
              </svg>
            )}
            {f.label}
          </button>
        ))}
        <a className="ev-fp-add" href={settingsHref}>+ New field</a>
      </div>
      <p className="ev-fp-note">
        Set once for the chapter, not per event — every event gets the same sheet.
      </p>
    </div>
  );
}
