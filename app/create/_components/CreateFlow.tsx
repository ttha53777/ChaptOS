"use client";

/**
 * The /create flow, in paper: you draft a CHARTER (design:
 * _design/Org Creation Paper Mock.html). Owns the Draft (useDraft: reducer +
 * localStorage write-through + restore), the step router and its gates, the
 * charter's flash state, and the mobile drawer the charter rides in.
 *
 * Name → Interview → Roles → Timeline → Charter → Sign in/Build, then the
 * founder lands on /<slug>/onboarding, the day-one welcome inside the real app.
 *
 * ?resume=1 is the post-OAuth leg: the callback lands back here, the draft is
 * restored from localStorage, and the Build step fires provisioning on its own.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { APP_NAME } from "@/lib/domains";
import type { CreateStep } from "@/lib/onboarding/draft";
import { draftSlug, useCreateTheme, useDraft } from "./flow-state";
import { Charter, type CharterFlash, type CharterSection } from "./Charter";
import { NameStep } from "./NameStep";
import { InterviewStep } from "./InterviewStep";
import { RolesStep } from "./RolesStep";
import { TimelineStep } from "./TimelineStep";
import { CharterStep } from "./CharterStep";
import { BuildStep } from "./BuildStep";
import { Mark } from "./Mark";
import { Ic, pagesOn } from "./paper";
import { useSession } from "./useSession";
import { slugBlocks, useSlugCheck } from "./useSlugCheck";

const STEPS: { id: CreateStep; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "interview", label: "Interview" },
  { id: "roles", label: "Roles" },
  { id: "timeline", label: "Timeline" },
  { id: "blueprint", label: "Charter" },
  { id: "build", label: "Sign in" },
];
const ORDER = STEPS.map(s => s.id);

/** Steps whose content is derived from interview answers — see `gated`. */
const PAST_INTERVIEW: CreateStep[] = ["roles", "timeline", "blueprint", "build"];

export function CreateFlow() {
  const { draft, dispatch, ready, origin, startOver } = useDraft();
  const { theme, toggle: toggleTheme } = useCreateTheme();
  const { session, signOut } = useSession();
  const searchParams = useSearchParams();
  const [flash, setFlash] = useState<CharterFlash>(null);
  const [slugNotice, setSlugNotice] = useState<string | null>(null);
  const [resume, setResume] = useState(false);
  const [resumeBarClosed, setResumeBarClosed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const step = draft.step;
  const named = !!draft.name.trim();
  const slug = draftSlug(draft);
  // Owned here, not by the field: the charter's Build button and the step
  // gate both need the answer.
  const slugState = useSlugCheck(slug, step === "blueprint" || step === "build");

  // Steps past the interview read a page set the interview decides, so they're
  // gated on the kind beat — a rail jump would otherwise land on a charter
  // built from a template guess. The Timeline waits for the whole interview:
  // every row it shows is gated by pages the month/money/docs beats decide.
  const gated = useCallback(
    (next: CreateStep): CreateStep | null => {
      if (next === "build" && !named) return "name";
      if (!PAST_INTERVIEW.includes(next)) return null;
      if (!draft.kind) return "interview";
      if (next === "timeline" && !draft.interviewDone) return "interview";
      return null;
    },
    [draft.kind, draft.interviewDone, named],
  );

  const goto = useCallback(
    (next: CreateStep) => {
      let to = gated(next) ?? next;
      // The ticket is only reachable with a usable address.
      if (to === "build" && slugBlocks(slugState)) to = "blueprint";
      setDrawer(false);
      dispatch({ type: "goto", step: to });
      window.scrollTo(0, 0);
    },
    [dispatch, gated, slugState],
  );

  // Post-OAuth resume: jump straight to Build and let it fire. Only once the
  // localStorage restore has run — before that the draft is empty.
  useEffect(() => {
    if (!ready) return;
    if (searchParams.get("resume") !== "1") return;
    setResume(true);
    if (draft.name.trim()) dispatch({ type: "goto", step: "build" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const onFlash = useCallback((section: CharterSection) => {
    setFlash(f => ({ section, key: (f?.key ?? 0) + 1 }));
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  // The name lands on the charter the moment there is one.
  const [wasNamed, setWasNamed] = useState(named);
  useEffect(() => {
    if (named && !wasNamed) onFlash("name");
    setWasNamed(named);
  }, [named, wasNamed, onFlash]);

  // A different address answers whatever bounced the build.
  useEffect(() => setSlugNotice(null), [slug]);

  // ←/→ step the rail and T flips the paper — never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (e.key === "Escape") return setDrawer(false);
      if (e.key === "t" || e.key === "T") return void toggleTheme();
      const idx = ORDER.indexOf(step);
      if (e.key === "ArrowRight" && idx < ORDER.length - 1 && !gated(ORDER[idx + 1]!)) goto(ORDER[idx + 1]!);
      if (e.key === "ArrowLeft" && idx > 0) goto(ORDER[idx - 1]!);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, goto, gated, toggleTheme]);

  const showResumeBar = origin === "resumed" && !resumeBarClosed && step !== "build";
  const curIdx = ORDER.indexOf(step);
  const stepDone = (id: CreateStep) => {
    if (id === "name") return named;
    if (id === "interview") return draft.interviewDone;
    return ORDER.indexOf(id) < curIdx && !gated(id);
  };
  const founderFallback = session?.name ?? null;
  const withCharter = step === "name" || step === "interview";

  return (
    <div className="ocp">
      <div className="shell">
        <header className="top">
          <a className="wm" href="/" aria-label={`${APP_NAME} home`}>
            <span className="orglogo">{APP_NAME[0]}</span>
            <span className="wt">{APP_NAME}</span>
          </a>
          <nav className="rail" aria-label="Steps">
            {STEPS.map((s, i) => {
              const cur = step === s.id;
              const locked = !!gated(s.id);
              const done = stepDone(s.id) && !cur;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={cur ? "step" : undefined}
                  disabled={locked}
                  className={done ? "done" : undefined}
                  title={s.label}
                  onClick={() => goto(s.id)}
                >
                  <span className="n">{done ? <Ic name="check" /> : locked ? <Ic name="lock" /> : i + 1}</span>
                  <span className="lb">{s.id === "build" && session ? "Build" : s.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="top-r">
            <span className="tag">{session && session.orgs.length ? "A second org" : "Create your org"}</span>
            <button
              type="button"
              className="iconbtn theme"
              aria-label="Switch paper (T)"
              title="Switch paper (T)"
              onClick={toggleTheme}
            >
              <Ic name={theme === "dusk" ? "sun" : "moon"} />
            </button>
          </div>
        </header>

        {showResumeBar && (
          <div className="resume" role="status">
            <span className="k">Draft</span>
            <p>
              Picked up where you left off
              {named ? (
                <>
                  {" "}— <b>{draft.name.trim()}</b>
                </>
              ) : null}
              . Saved on this device for 7 days.
            </p>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setResumeBarClosed(true);
                startOver();
              }}
            >
              Start over
            </button>
            <button type="button" className="x" aria-label="Dismiss" onClick={() => setResumeBarClosed(true)}>
              <Ic name="x" />
            </button>
          </div>
        )}

        <main className="stage" data-step={step}>
          {step === "name" && (
            <div className="split split--name" data-named={named ? "1" : "0"}>
              <NameStep draft={draft} dispatch={dispatch} session={session} onContinue={() => goto("interview")} />
              <div className="slot" aria-hidden={!named}>
                <Charter draft={draft} flash={flash} founderFallback={founderFallback} />
              </div>
            </div>
          )}

          {step === "interview" && (
            <div className="split">
              <InterviewStep
                draft={draft}
                dispatch={dispatch}
                onFlash={onFlash}
                onDone={() => goto("roles")}
                founderFallback={founderFallback}
              />
              <div className="slot">
                <Charter draft={draft} flash={flash} showTypes={draft.interviewDone} founderFallback={founderFallback} />
              </div>
            </div>
          )}

          {step === "roles" && (
            <RolesStep draft={draft} dispatch={dispatch} founderFallback={founderFallback} onContinue={() => goto("timeline")} />
          )}

          {step === "timeline" && <TimelineStep draft={draft} dispatch={dispatch} onContinue={() => goto("blueprint")} />}

          {step === "blueprint" && (
            <CharterStep
              draft={draft}
              dispatch={dispatch}
              slugState={slugState}
              slugNotice={slugNotice}
              signedIn={!!session}
              founderFallback={founderFallback}
              onGo={goto}
              onBuild={() => goto("build")}
            />
          )}

          {step === "build" && (
            <BuildStep
              draft={draft}
              session={session}
              autoBuild={resume}
              onSignOut={() => void signOut()}
              onSlugRejected={message => {
                setResume(false);
                setSlugNotice(message);
                dispatch({ type: "goto", step: "blueprint" });
              }}
              onBackToCharter={() => {
                setResume(false);
                goto("blueprint");
              }}
            />
          )}
        </main>

        {withCharter && named && (
          <button type="button" className="peek" onClick={() => setDrawer(true)}>
            <Mark name={draft.name} logoUrl={draft.logoDataUrl} />
            Charter · {pagesOn(draft).length} pages
          </button>
        )}
      </div>

      {withCharter && (
        <div
          className={`drawer${drawer ? " open" : ""}`}
          aria-hidden={!drawer}
          onClick={e => {
            if (e.target === e.currentTarget) setDrawer(false);
          }}
        >
          <div>{drawer && <Charter draft={draft} showTypes={draft.interviewDone} founderFallback={founderFallback} />}</div>
        </div>
      )}
    </div>
  );
}
