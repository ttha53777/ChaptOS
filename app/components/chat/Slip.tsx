"use client";

// Status as a slip, never as prose: one line on what happened, one on what it
// means, and the way forward. Used where a turn has no answer of its own — the
// stream dropped, the user stopped it, or the reply is a drafted change waiting
// on the writ above. See _design/Ask Chapt Answer System Mock.html#slips.

import type { ReactNode } from "react";

import type { AnswerTone } from "./tone";

export function Slip({ tone, dashed, icon, title, children, action }: {
  tone: AnswerTone;
  /** A quiet slip: the user's own doing (Stop), nothing went wrong. */
  dashed?: boolean;
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: { label: string; icon?: ReactNode; onClick: () => void };
}) {
  return (
    <div className={`slip t-${tone}${dashed ? " dash" : ""} in in-3`} role="status">
      <span className="slip-g">{icon}</span>
      <span className="slip-tx">
        <b>{title}</b>
        {children}
      </span>
      {action && (
        <button type="button" className="slip-act" onClick={action.onClick}>
          {action.icon}{action.label}
        </button>
      )}
    </div>
  );
}
