"use client";

/**
 * The fixed bottom step rail + the italic caption above it. Any step can be
 * revisited; jumping ahead past the interview backfills template defaults
 * (never a name — Build stays gated on that).
 */

import type { CreateStep } from "@/lib/onboarding/draft";

const RAIL: { step: CreateStep; n: string; label: string }[] = [
  { step: "name", n: "1", label: "NAME" },
  { step: "interview", n: "2", label: "INTERVIEW" },
  { step: "roles", n: "3", label: "ROLES" },
  { step: "blueprint", n: "4", label: "BLUEPRINT" },
  { step: "build", n: "5", label: "BUILD" },
];

const CAPS: Record<CreateStep, React.ReactNode> = {
  name: "Fifteen seconds in, the blueprint has your name on it.",
  interview: "A few quick questions. The sheet assembles as you answer — honestly a plan, not a fake app.",
  roles: "You own the roles — one glance to see them, one tap to change them.",
  blueprint: "The whole plan on one sheet — a last look before we build exactly this.",
  build: "Auth at the last responsible moment, then the real provisioning steps run.",
};

export function StepRail({
  step,
  onGo,
}: {
  step: CreateStep;
  onGo: (step: CreateStep) => void;
}) {
  return (
    <>
      <div className="rail-cap">{CAPS[step]}</div>
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
