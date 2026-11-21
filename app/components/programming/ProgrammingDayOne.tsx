"use client";

import { PaperIcon } from "../paper/PaperIcon";
import { DAY_ONE, dayOneInitials, dayOneWhen } from "@/lib/programme/board";

/**
 * Paper's first frame for an org with nothing on the board — the same shape as
 * the Fundraisers day one: four numbered pictures of the steps, one button.
 *
 * Each picture is the SAME event as it looks in its lane (sticky → dashed card →
 * inked card on the Timeline → filed card), so the board's paper is learned
 * here before there's anything on it. The sample is one of this org's own
 * starter ideas in its own type colour, so it never names a category the
 * chapter doesn't have.
 */
export function ProgrammingDayOne({
  ready,
  canManage,
  sample,
  owner,
  today,
  onNew,
}: {
  /** The viewer is known. Until then neither the button nor the members' note
   *  shows, so an officer never flashes "your officers will add the first one". */
  ready: boolean;
  canManage: boolean;
  /** Null while the org's types load; nothing renders until then. */
  sample: { title: string; label: string | null; color: string | null } | null;
  /** Who the Planning picture shows as owner. */
  owner: string;
  today: string;
  onNew: () => void;
}) {
  if (!sample) return null;
  const style = { ["--tc" as string]: sample.color ?? "var(--muted)" };
  const type = sample.label && <span className="d1-ty">{sample.label}</span>;
  const initials = dayOneInitials(owner);
  // Two weeks out, so the Confirmed picture shows a date that reads as upcoming.
  const whenLabel = dayOneWhen(today);
  const [s1, s2, s3, s4] = DAY_ONE.steps;

  return (
    <>
      <section className="ev-d1" aria-label="How Programming works">
        <figure>
          <div><div className="d1-card" data-stage="idea" style={style}><b>{sample.title}</b>{type}</div></div>
          <figcaption><b>{s1.title}</b><span>{s1.sub}</span></figcaption>
        </figure>
        <figure>
          <div>
            <div className="d1-card" data-stage="planning" style={style}>
              <b>{sample.title}</b>{type}
              <span className="d1-m"><i className="d1-av">{initials}</i>{owner}</span>
            </div>
          </div>
          <figcaption><b>{s2.title}</b><span>{s2.sub}</span></figcaption>
        </figure>
        <figure>
          <div>
            <div className="d1-card" data-stage="confirmed" style={style}>
              <b>{sample.title}</b>
              <span className="d1-m"><PaperIcon name="cal" />{whenLabel}</span>
              <span className="d1-m"><PaperIcon name="pin" />{DAY_ONE.place}</span>
              <span className="d1-pub"><PaperIcon name="eye" />{DAY_ONE.onTimeline}</span>
            </div>
          </div>
          <figcaption><b>{s3.title}</b><span>{s3.sub}</span></figcaption>
        </figure>
        <figure>
          <div>
            <div className="d1-card" data-stage="done" style={style}>
              <span className="d1-stamp">{DAY_ONE.stamp}</span>
              <b>{sample.title}</b>
              <span className="d1-stars" aria-label="4 of 5 stars">★★★★<s>★</s></span>
              <span className="d1-m">{DAY_ONE.quote}</span>
            </div>
          </div>
          <figcaption><b>{s4.title}</b><span>{s4.sub}</span></figcaption>
        </figure>
      </section>
      {!ready ? null : canManage ? (
        <div className="ev-d1-cta">
          <button className="ev-add" onClick={onNew}><PaperIcon name="plus" />{DAY_ONE.cta}</button>
        </div>
      ) : (
        <p className="ev-d1-note">{DAY_ONE.member}</p>
      )}
    </>
  );
}
