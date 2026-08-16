"use client";

/**
 * The four lanes as a control, plus a sentence saying where you are and what the
 * next lane costs.
 *
 * This replaces a bare <select> listing all four stages with no indication which
 * were reachable — picking a locked one just produced a server error, so the
 * rules were only discoverable by tripping over them.
 *
 * The missing field names in the sentence are BUTTONS. A gate that names what it
 * wants should be one click from the thing that satisfies it; making someone
 * read "needs a location" and then go find the location row is a step the
 * interface can simply skip.
 */

import { canEnter, missingFor, needsConfirmFirst } from "@/lib/programming";
import {
  STAGES,
  STAGE_LABELS,
  STAGE_MEANINGS,
  type ProgrammingStage,
} from "@/lib/state/programming-stage";
import type { ProgrammingTask } from "../../../data";

export function StageControl({
  event,
  canManage,
  busy,
  onStage,
  onJumpToField,
}: {
  event: ProgrammingTask;
  canManage: boolean;
  busy?: boolean;
  onStage: (stage: ProgrammingStage) => void;
  /** Open a required field's editor by key — what the inline gaps link to. */
  onJumpToField: (key: string) => void;
}) {
  const at = STAGES.indexOf(event.stage);
  const nextStage: ProgrammingStage | null =
    event.stage === "idea" ? "planning"
    : event.stage === "planning" ? "confirmed"
    : event.stage === "confirmed" ? "done"
    : null;
  const missing = nextStage ? missingFor(event, nextStage) : [];

  return (
    <div className="ev-stage">
      <div className="ev-stage-row" role="group" aria-label="Stage">
        {STAGES.map((s, i) => {
          const isOn = s === event.stage;
          const isPast = i < at;
          // Locked = a forward lane this event cannot enter yet, for either
          // reason: fields it hasn't got, or the Confirmed step it skipped.
          const locked = i > at && (!canEnter(event, s) || needsConfirmFirst(event, s));
          return (
            <button
              key={s}
              type="button"
              disabled={!canManage || busy || isOn}
              aria-current={isOn ? "step" : undefined}
              onClick={() => onStage(s)}
              className={`ev-stage-step${isOn ? " on" : ""}${isPast ? " past" : ""}${locked ? " locked" : ""}`}
              title={locked ? `Needs more before it can be ${STAGE_LABELS[s].toLowerCase()}` : undefined}
            >
              {locked && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 018 0v4" />
                </svg>
              )}
              {STAGE_LABELS[s]}
            </button>
          );
        })}
      </div>

      <p className="ev-stage-say">
        <b>{STAGE_LABELS[event.stage]}.</b> {STAGE_MEANINGS[event.stage]}
        {nextStage && missing.length > 0 && (
          <>
            {" "}Needs{" "}
            {missing.map((f, i) => (
              <span key={f.key}>
                {i > 0 && (i === missing.length - 1 ? " and " : ", ")}
                <button type="button" className="ev-stage-gap" onClick={() => onJumpToField(f.key)}>
                  {f.label.toLowerCase()}
                </button>
              </span>
            ))}{" "}
            to reach {STAGE_LABELS[nextStage]}.
          </>
        )}
        {nextStage && missing.length === 0 && event.stage !== "confirmed" && (
          <> Ready for {STAGE_LABELS[nextStage]}.</>
        )}
        {/* Confirmed explains its own padlock: the fields are frozen, and the way
            out is named rather than left to be discovered by clicking one. */}
        {event.stage === "confirmed" && (
          <>
            {" "}Fields are locked while it&apos;s published —{" "}
            <button type="button" className="ev-stage-gap" onClick={() => onStage("planning")} disabled={!canManage}>
              move it back to Planning
            </button>{" "}
            to change them.
          </>
        )}
        {event.stage === "done" && <> Fields are part of the record now and can&apos;t be changed.</>}
      </p>
    </div>
  );
}
