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

/** Each lane's own accent, and the wash its halo is drawn in. */
const STAGE_COLOR: Record<ProgrammingStage, string> = {
  idea: "#6b6354", planning: "#ddb36a", confirmed: "#a78bfa", done: "#7fb08a",
};
const STAGE_BG: Record<ProgrammingStage, string> = {
  idea: "rgba(236,231,221,.05)", planning: "rgba(221,179,106,.10)",
  confirmed: "rgba(167,139,250,.10)", done: "rgba(127,176,138,.10)",
};

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
  // Done sits two lanes from Planning, and the sentence below only ever
  // describes the NEXT one — so from Idea or Planning its padlock would go
  // unexplained, and a locked step with nothing named beside it reads as a bug.
  const confirmFirst = needsConfirmFirst(event, "done") && at < STAGES.indexOf("done");

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
              // The lane's own colour, so the node, its halo and the rail behind
              // a completed step all read as that lane rather than as one
              // generic accent repeated four times.
              style={{ "--sc": STAGE_COLOR[s], "--sc-bg": STAGE_BG[s] } as React.CSSProperties}
              className={`ev-stage-step${isOn ? " on" : ""}${isPast ? " past" : ""}${locked ? " locked" : ""}`}
              aria-label={`${STAGE_LABELS[s]}${locked ? " — locked" : ""}`}
              title={locked ? `Needs more before it can be ${STAGE_LABELS[s].toLowerCase()}` : undefined}
            >
              <span className="ev-stage-node">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span className="ev-stage-lbl">{STAGE_LABELS[s]}</span>
            </button>
          );
        })}
      </div>

      <p className="ev-stage-say">
        <b>{STAGE_LABELS[event.stage]}.</b> {STAGE_MEANINGS[event.stage]}
        {nextStage && missing.length > 0 && (
          <>
            {" "}
            <span className="lock">
              Needs{" "}
              {missing.map((f, i) => (
                <span key={f.key}>
                  {i > 0 && (i === missing.length - 1 ? " and " : ", ")}
                  <button type="button" className="ev-stage-gap" onClick={() => onJumpToField(f.key)}>
                    {f.label.toLowerCase()}
                  </button>
                </span>
              ))}{" "}
              to reach {STAGE_LABELS[nextStage]}.
            </span>
          </>
        )}
        {/* Confirming is the one move that publishes, so it says so rather than
            reading like any other lane change. */}
        {nextStage && missing.length === 0 && event.stage === "planning" && (
          <> Ready to confirm — that publishes it to the chapter.</>
        )}
        {nextStage && missing.length === 0 && event.stage !== "confirmed" && event.stage !== "planning" && (
          <> Can move to {STAGE_LABELS[nextStage]}.</>
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
        {confirmFirst && (
          <>
            {" "}
            <span className="lock">Wrapping up comes after confirming</span> — the chapter
            has to have seen it first.
          </>
        )}
      </p>
    </div>
  );
}
