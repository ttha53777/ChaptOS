"use client";

/**
 * The fixed bottom step rail. Any step can be revisited; jumping ahead past
 * the interview backfills template defaults (never a name — Build stays
 * gated on that).
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
}: {
  step: CreateStep;
  onGo: (step: CreateStep) => void;
}) {
  return (
    <>
      <nav className="rail" aria-label="Steps">
        {RAIL.map(r => (
          <button
            key={r.step}
            className={step === r.step ? "on" : ""}
            onClick={() => onGo(r.step)}
          >
            <span className="n">{r.n}</span>
            <span className="lbl">{r.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
