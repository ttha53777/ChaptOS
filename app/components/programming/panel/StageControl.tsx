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

import { STAGE_SAY, stageSay, stepLocked } from "@/lib/programme/board";
import { STAGES, STAGE_LABELS, type ProgrammingStage } from "@/lib/state/programming-stage";
import type { ProgrammingTask } from "../../../data";

/** Each lane's own accent, and the wash its halo is drawn in. */
const STAGE_COLOR: Record<ProgrammingStage, string> = {
  idea: "var(--faint)", planning: "var(--gold)", confirmed: "var(--vio)", done: "var(--ok)",
};
const STAGE_BG: Record<ProgrammingStage, string> = {
  idea: "rgba(var(--ink-rgb),.05)", planning: "rgba(var(--gold-rgb),.10)",
  confirmed: "rgba(var(--vio-rgb),.10)", done: "rgba(var(--ok-rgb),.10)",
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
  const say = stageSay(event);

  return (
    <div className="ev-stage">
      <div className="ev-stage-row" role="group" aria-label="Stage" style={{ "--w": `${at * 25}%` } as React.CSSProperties}>
        {STAGES.map((s, i) => {
          const isOn = s === event.stage;
          const isPast = i < at;
          // Locked = a forward lane this event cannot enter yet, for either
          // reason: fields it hasn't got, or the Confirmed step it skipped.
          const locked = stepLocked(event, s);
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
        <b>{say.label}.</b> {say.meaning}
        {say.gap && (
          <>
            {" "}
            <span className="lock">
              Needs{" "}
              {say.gap.fields.map((f, i, all) => (
                <span key={f.key}>
                  {i > 0 && (i === all.length - 1 ? " and " : ", ")}
                  <button type="button" className="ev-stage-gap" onClick={() => onJumpToField(f.key)}>
                    {f.label}
                  </button>
                </span>
              ))}{" "}
              to reach {say.gap.next}.
            </span>
          </>
        )}
        {/* Confirming is the one move that publishes, so it says so rather than
            reading like any other lane change. */}
        {say.ready && <>{` ${say.ready}`}</>}
        {!say.gap && at === 0 && <> Can move to {STAGE_LABELS.planning}.</>}
        {/* Confirmed explains its own padlock: the fields are frozen, and the way
            out is named rather than left to be discovered by clicking one. */}
        {say.locked && (
          <>
            {" "}{STAGE_SAY.lockedBefore}{" "}
            <button type="button" className="ev-stage-gap" onClick={() => onStage("planning")} disabled={!canManage}>
              {STAGE_SAY.lockedLink}
            </button>{" "}
            {STAGE_SAY.lockedAfter}
          </>
        )}
        {say.done && <>{` ${say.done}`}</>}
        {say.confirmFirst && (
          <>
            {" "}
            <span className="lock">{STAGE_SAY.confirmFirst}</span>{` ${STAGE_SAY.confirmFirstTail}`}
          </>
        )}
      </p>
    </div>
  );
}
