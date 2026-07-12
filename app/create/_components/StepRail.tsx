"use client";

/**
 * The fixed bottom step rail. Any step already reached can be revisited, but a
 * step whose content isn't decided yet is disabled rather than clickable: the
 * steps past the interview render a page set the interview's beats own, so until
 * the kind beat is answered there is nothing honest to show there. `locked` comes
 * from the flow's single `goto` guard, so the rail can't disagree with it.
 */

import type { CreateStep } from "@/lib/onboarding/draft";

const RAIL: { step: CreateStep; n: string; label: string }[] = [
  { step: "name", n: "1", label: "NAME" },
  { step: "interview", n: "2", label: "INTERVIEW" },
  { step: "roles", n: "3", label: "ROLES" },
  { step: "blueprint", n: "4", label: "BLUEPRINT" },
  { step: "build", n: "5", label: "BUILD" },
];

export function StepRail({
  step,
  onGo,
  locked,
}: {
  step: CreateStep;
  onGo: (step: CreateStep) => void;
  locked?: (step: CreateStep) => boolean;
}) {
  return (
    <>
      <nav className="rail" aria-label="Steps">
        {RAIL.map(r => {
          const off = locked?.(r.step) ?? false;
          return (
            <button
              key={r.step}
              className={step === r.step ? "on" : ""}
              disabled={off}
              onClick={() => onGo(r.step)}
            >
              <span className="n">{r.n}</span>
              <span className="lbl">{r.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
