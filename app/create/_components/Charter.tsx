"use client";

/**
 * The CHARTER — the live blueprint sheet that assembles beside the name and the
 * interview: a punched loose-leaf page whose sections fill in (and flash) as
 * each answer lands. The build step re-renders it filed, with the rubber stamp.
 *
 * Never fake app chrome: this is a document describing the workspace, not a
 * preview of it.
 */

import { useEffect, useRef } from "react";
import { activityPage } from "@/lib/onboarding/activities";
import { workflowsFromAnswers } from "@/lib/onboarding/answers";
import type { Draft } from "@/lib/onboarding/draft";
import { BUILTIN_METRIC_IDS, BUILTIN_METRIC_LABEL } from "@/lib/onboarding/kinds";
import { activeAreas, areaState } from "@/lib/onboarding/perm-areas";
import { TERM_PERIOD_VOCAB } from "@/lib/onboarding/terms";
import { DISPLAY_HOST, draftEventTypes, draftSlug, draftVocab, wfSet } from "./flow-state";
import { Mark } from "./Mark";
import { Ic, pageOn, pageRows, plural, seatTone, todayLong } from "./paper";

export type CharterSection = "name" | "pages" | "words" | "metrics" | "seats" | "types" | "foot";
export type CharterFlash = { section: CharterSection; key: number } | null;

/** The month beat before it's answered: what's ticked, and the tile under the
    pointer — so each tap shows its page here instead of waiting for the submit. */
export type MonthPreview = { acts: string[]; hover: string | null };

export function trackedLabels(draft: Draft): string[] {
  return [
    ...BUILTIN_METRIC_IDS.filter(id => draft.metrics[id]).map(id => BUILTIN_METRIC_LABEL[id]),
    ...draft.metrics.custom.map(m => m.name),
  ];
}

/** The period word the org will use — the term model's, unless the founder renamed it. */
export function periodWord(draft: Draft): string {
  return draft.vocab.Period ?? (draft.term ? TERM_PERIOD_VOCAB[draft.term.model] : draftVocab(draft, "Period"));
}

function Sec({
  id,
  title,
  count,
  flash,
  pending,
  children,
}: {
  id: CharterSection;
  title: string;
  count?: string | number | null;
  flash: CharterFlash;
  pending?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className={`ch-sec${flash?.section === id ? " flash" : ""}`} data-sec={id} key={flash?.section === id ? flash.key : undefined}>
      <h6>
        <span>{title}</span>
        {count != null && <i>{count}</i>}
      </h6>
      {pending ? (
        <>
          <span className="ghostln" style={{ ["--w" as string]: "72%" }} />
          <span className="ghostln" style={{ ["--w" as string]: "48%" }} />
          <p className="ch-pend">{pending}</p>
        </>
      ) : (
        children
      )}
    </div>
  );
}

export function Charter({
  draft,
  flash = null,
  showTypes = false,
  filed = false,
  stamp = null,
  founderFallback,
  preview = null,
}: {
  draft: Draft;
  flash?: CharterFlash;
  preview?: MonthPreview | null;
  showTypes?: boolean;
  filed?: boolean;
  /** The rubber stamp, once the org exists: "slam" plays the landing. */
  stamp?: null | "still" | "slam";
  /** The Google name, when the interview's "who am I talking to?" was skipped. */
  founderFallback?: string | null;
}) {
  const name = draft.name.trim();
  const slug = draftSlug(draft);
  // Pages come from the same rebuild a submitted answer goes through, so the
  // preview can't show a page the answer wouldn't build.
  const shown = preview
    ? { ...draft, enabledWorkflows: workflowsFromAnswers({ ...draft.answers, acts: preview.acts }) }
    : draft;
  const hoverPage = preview?.hover ? activityPage(preview.hover) : undefined;
  const rows = pageRows(shown);
  const pages = rows.filter(p => pageOn(shown, p));
  const ghostId = rows.find(p => p.id === hoverPage && !pageOn(shown, p))?.id;

  // Chips that weren't on the sheet a moment ago get the drop-in.
  const prev = useRef<string[] | null>(null);
  const before = prev.current;
  useEffect(() => {
    prev.current = pages.map(p => p.id);
  });

  const mets = trackedLabels(draft);
  const member = draftVocab(draft, "Member");
  const finance = draft.enabledWorkflows.includes("finance");
  const areas = activeAreas(wfSet(draft));
  const types = draftEventTypes(draft).filter(t => t.active);
  const founder = draft.founderName.trim() || founderFallback?.trim() || "";
  const founderSeat = draft.seats.find(s => s.all);
  const kinded = draft.kind !== null;

  return (
    <div className="charter">
      <div className={`ch-hd${flash?.section === "name" ? " flash" : ""}`}>
        <p className="ch-k">
          Charter
          {filed ? <span className="st ok">Filed</span> : <span className="st">Draft · no account yet</span>}
        </p>
        <div className="ch-org">
          <Mark name={name} logoUrl={draft.logoDataUrl} />
          <div>
            <b>{name || <span className="ph">Your org</span>}</b>
            <small>
              {DISPLAY_HOST}/{slug || "…"}
            </small>
          </div>
        </div>
      </div>

      <Sec id="pages" title="Pages" count={kinded ? pages.length : null} flash={flash}>
        <div className="chips">
          {rows
            .filter(p => pageOn(shown, p) || p.id === ghostId)
            .map(p => {
              const cls = p.id === ghostId
                ? ` ghost t-${p.tone}`
                : p.lock
                  ? " lock"
                  : ` pin t-${p.tone}${before && !before.includes(p.id) ? " new" : ""}${p.id === hoverPage ? " lit" : ""}`;
              return (
                <span key={p.id} className={`chip${cls}`} style={{ ["--p-hs" as string]: `var(--${p.tone})` }}>
                  <Ic name={p.icon} />
                  {p.label}
                </span>
              );
            })}
        </div>
        {kinded && !draft.answers.acts && !preview?.acts.length && <p className="ch-pend">The rest arrive with “a normal month”.</p>}
      </Sec>

      <Sec id="words" title="Your words" flash={flash} pending={kinded ? null : "Fills in when you say what kind of org this is."}>
        <p className="words">
          Your people are <b>{plural(member)}</b>. You meet as <b>{draftVocab(draft, "Meetings")}</b>
          {finance && (
            <>
              . Money owed is <b>{draftVocab(draft, "Dues")}</b>
            </>
          )}
          . The year runs in <b>{plural(periodWord(draft))}</b>
          {draft.term && (
            <>
              {" "}— now <b>{draft.term.label}</b>
            </>
          )}
          .
        </p>
      </Sec>

      <Sec
        id="metrics"
        title="Tracking"
        count={kinded ? `${mets.length} per ${member.toLowerCase()}` : null}
        flash={flash}
        pending={kinded ? null : "Attendance, GPA, dues — whatever you’ll actually check."}
      >
        {mets.length ? (
          <div className="chips">
            {mets.map(m => (
              <span key={m} className="chip">
                <Ic name="bars" />
                {m}
              </span>
            ))}
          </div>
        ) : (
          <p className="ch-pend">Nothing tracked per {member.toLowerCase()} yet.</p>
        )}
      </Sec>

      <Sec
        id="seats"
        title="Leadership"
        count={kinded ? `${draft.seats.length} seats` : null}
        flash={flash}
        pending={kinded ? null : "A founder seat, plus the offices your kind of org usually elects."}
      >
        {draft.seats.map((s, i) => {
          const n = areas.filter(a => areaState(s.permissions, a) !== "off").length;
          return (
            <div key={i} className="seatln" style={{ ["--sc" as string]: `var(--${seatTone(s.color, i)})` }}>
              <span className="sw2" />
              <b>{s.title || "Untitled seat"}</b>
              <small>{s.all ? "you · everything" : n === 1 ? "1 ability" : `${n} abilities`}</small>
            </div>
          );
        })}
      </Sec>

      {showTypes && (
        <Sec id="types" title="Timeline" count={`${types.length} categories`} flash={flash}>
          <div className="chips">
            {types.map(t => (
              <span
                key={t.slug}
                className="chip tp"
                style={{ ["--tcl" as string]: t.color, ["--tcd" as string]: t.colorDark }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </Sec>
      )}

      <div className={`ch-ft${flash?.section === "foot" ? " flash" : ""}`}>
        <div className="sig">
          <span className={`ln${founder ? "" : " empty"}`}>{founder || "—"}</span>
          <small>Founder{founderSeat ? ` · ${founderSeat.title}` : ""}</small>
        </div>
        <span className="date">
          {filed ? "Filed" : "Drafted"} {todayLong()}
        </span>
      </div>

      {stamp && (
        <div className={`stamp${stamp === "slam" ? " slam" : ""}`} aria-hidden="true">
          <b>Chartered</b>
          <small>
            {DISPLAY_HOST}/{slug}
          </small>
          <small>{todayLong().replace(",", " ·")}</small>
        </div>
      )}
    </div>
  );
}
