"use client";

/**
 * The /create flow orchestrator. Owns the Draft (useDraft: reducer +
 * localStorage write-through + restore), the step router, and the live
 * blueprint sheet's flash state.
 *
 * ?resume=1 is the post-OAuth leg: the callback lands back here, the draft is
 * restored from localStorage, and the Build step auto-fires provisioning.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { APP_NAME } from "@/lib/domains";
import type { CreateStep } from "@/lib/onboarding/draft";
import { useDraft } from "./flow-state";
import { BlueprintSheet, type SheetFlash } from "./BlueprintSheet";
import { NameStep } from "./NameStep";
import { InterviewStep } from "./InterviewStep";
import { RolesStep } from "./RolesStep";
import { TimelineStep } from "./TimelineStep";
import { BlueprintStep } from "./BlueprintStep";
import { BuildStep } from "./BuildStep";
import { StepRail } from "./StepRail";

/** Steps whose content is derived from interview answers — see `gated` below. */
const PAST_INTERVIEW: CreateStep[] = ["roles", "timeline", "blueprint", "build"];

export function CreateFlow() {
  const [draft, dispatch, restored] = useDraft();
  const searchParams = useSearchParams();
  const [flash, setFlash] = useState<SheetFlash>(null);
  const [slugNotice, setSlugNotice] = useState<string | null>(null);
  const [resume, setResume] = useState(false);
  // The event type a blueprint chip deep-linked to — the Timeline step opens
  // its color strip so the founder lands on the row they tapped.
  const [focusType, setFocusType] = useState<string | null>(null);

  const step = draft.step;

  // Steps past the interview read a page set the interview is supposed to have
  // decided, so they're gated on the kind beat having been answered — otherwise a
  // rail jump lands on a blueprint built from a template guess, which is the one
  // thing the beats exist to prevent. Both the rail and the ←/→ keys route
  // through here, so this single guard closes every path.
  const gated = useCallback(
    (next: CreateStep) => {
      if (!PAST_INTERVIEW.includes(next)) return null;
      if (!draft.kind) return "interview";
      // The Timeline step is a stricter case than the rest: every row it renders
      // is gated by the PAGE SET, which the interview's activity beat decides —
      // several beats after the kind beat. Reached on `kind` alone it shows seven
      // ghosted types over an empty preview, which reads as broken rather than as
      // "your types follow your pages". So it waits for the interview to finish.
      if (next === "timeline" && !draft.interviewDone) return "interview";
      return null;
    },
    [draft.kind, draft.interviewDone],
  );

  const goto = useCallback(
    (next: CreateStep) => {
      if (next === "build" && !draft.name.trim()) return void dispatch({ type: "goto", step: "name" });
      const bounce = gated(next);
      if (bounce) return void dispatch({ type: "goto", step: bounce });
      dispatch({ type: "goto", step: next });
    },
    [dispatch, draft.name, gated],
  );

  // Post-OAuth resume: jump straight to Build and let it auto-fire. Only once
  // the localStorage restore has run — before that the draft is empty.
  useEffect(() => {
    if (!restored) return;
    if (searchParams.get("resume") !== "1") return;
    setResume(true);
    if (draft.name.trim()) dispatch({ type: "goto", step: "build" });
    // A missing/expired draft falls through to step 1 — nothing to build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  const onFlash = useCallback((section: NonNullable<SheetFlash>["section"]) => {
    setFlash(f => ({ section, key: (f?.key ?? 0) + 1 }));
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  // ←/→ step the rail, like the mock — never while typing.
  useEffect(() => {
    const ORDER: CreateStep[] = ["name", "interview", "roles", "timeline", "blueprint", "build"];
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const idx = ORDER.indexOf(step);
      if (e.key === "ArrowRight" && idx < ORDER.length - 1) goto(ORDER[idx + 1]!);
      if (e.key === "ArrowLeft" && idx > 0) goto(ORDER[idx - 1]!);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, goto]);

  const world = step === "build" ? "dark" : "paper";

  return (
    <div className="crf" data-world={world} data-step={step}>
      <header className="chrome">
        <div className="wm">
          <span className="glyph">{APP_NAME[0]}</span>
          <span className="wm-txt">{APP_NAME.toUpperCase()}</span>
        </div>
        <div className="chrome-tag">CREATE YOUR ORG</div>
      </header>

      <main className="screens">
        {step === "name" && (
          <section className="scr" data-step="name" key="name">
            {/* data-named drives the "reveal" choreography: empty → centered name,
                no sheet; first keystroke slides the sheet in and the name to the left. */}
            <div className="split split--name" data-named={draft.name.trim() ? "1" : "0"}>
              <NameStep draft={draft} dispatch={dispatch} onContinue={() => goto("interview")} />
              <div className="sheet-slot" aria-hidden={!draft.name.trim()}>
                <BlueprintSheet draft={draft} flash={flash} />
              </div>
            </div>
          </section>
        )}

        {step === "interview" && (
          <section className="scr" data-step="interview" key="interview">
            <div className="split">
              <InterviewStep
                draft={draft}
                dispatch={dispatch}
                onFlash={onFlash}
                onDone={() => goto("roles")}
              />
              <div className="sheet-slot">
                <BlueprintSheet draft={draft} flash={flash} />
              </div>
            </div>
          </section>
        )}

        {step === "roles" && (
          <section className="scr" data-step="roles" key="roles">
            <RolesStep draft={draft} dispatch={dispatch} onContinue={() => goto("timeline")} />
          </section>
        )}

        {step === "timeline" && (
          <section className="scr" data-step="timeline" key="timeline">
            <TimelineStep
              draft={draft}
              dispatch={dispatch}
              openSlug={focusType}
              onContinue={() => {
                setFocusType(null);
                goto("blueprint");
              }}
            />
          </section>
        )}

        {step === "blueprint" && (
          <section className="scr" data-step="blueprint" key="blueprint">
            <BlueprintStep
              draft={draft}
              dispatch={dispatch}
              slugNotice={slugNotice}
              onBackToRoles={() => goto("roles")}
              onEditTypes={slug => {
                setFocusType(slug ?? null);
                goto("timeline");
              }}
              onBuild={() => {
                setSlugNotice(null);
                goto("build");
              }}
            />
          </section>
        )}

        {step === "build" && (
          <section className="scr" data-step="build" key="build">
            <BuildStep
              draft={draft}
              autoBuild={resume}
              onSlugTaken={message => {
                setResume(false);
                setSlugNotice(message);
                goto("blueprint");
              }}
              onBackToBlueprint={() => {
                setResume(false);
                goto("blueprint");
              }}
              onBackToName={() => goto("name")}
            />
          </section>
        )}
      </main>

      <StepRail step={step} onGo={goto} locked={s => gated(s) !== null} />
    </div>
  );
}
