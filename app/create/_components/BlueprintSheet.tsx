"use client";

/**
 * The live blueprint sheet — the right-hand pane that assembles as the founder
 * names the org and answers the interview. Sections: head, Pages, Your words,
 * Tracking, Leadership. `flash` briefly highlights the section that just changed.
 *
 * Sections are STABLE across renders (no React key on them) so that motion here
 * always means something: a section pulses only when its own content changed, and
 * within Pages, a chip fades in only when that page was genuinely added. Anything
 * that remounts a section replays its entrance animation on unchanged content,
 * which reads as a refresh that didn't refresh anything.
 */

import type { Draft } from "@/lib/onboarding/draft";
import { BUILTIN_METRIC_IDS, BUILTIN_METRIC_LABEL } from "@/lib/onboarding/kinds";
import { DISPLAY_HOST, draftSlug, draftVocab, wfSet } from "./flow-state";
import { OrgMark } from "./OrgMark";

/**
 * The section that just changed, or null. `key` distinguishes two consecutive
 * flashes of the SAME section: it makes each flash a fresh object so the 900ms
 * clear-timer re-arms, which is what re-toggles the `.flash` class and replays
 * the pulse. It is deliberately NOT a React key — keying the sections on it is
 * what used to remount every section (and replay its entrance animation) every
 * time any ONE of them flashed, so the Pages list appeared to refresh without
 * ever changing.
 */
export type SheetFlash =
  | { section: "pages" | "words" | "seats" | "name" | "metrics"; key: number }
  | null;

/**
 * The pages this draft would ship, in sheet order. `id` is the React key and is
 * deliberately NOT the label: a vocab change ("Members" → "Brothers") relabels a
 * chip that is still the same page, and keying on the label would unmount it and
 * replay the entrance animation, reading as "a new page appeared" when nothing
 * was added. Keyed on the id, only a genuinely new page animates in.
 */
function pageChips(draft: Draft): { id: string; l: string; locked?: boolean }[] {
  const w = wfSet(draft);
  const v = (key: Parameters<typeof draftVocab>[1], plural = false) => draftVocab(draft, key, plural);
  const pages: { id: string; l: string; locked?: boolean }[] = [
    { id: "dashboard", l: "Dashboard", locked: true },
    { id: "timeline", l: "Timeline", locked: true },
  ];
  if (draft.kind) {
    if (w.has("meetings")) pages.push({ id: "meetings", l: v("Meetings") });
    if (w.has("members")) pages.push({ id: "members", l: v("Member", true) });
    if (w.has("finance")) pages.push({ id: "finance", l: v("Dues") });
    if (w.has("attendance")) pages.push({ id: "attendance", l: "Attendance" });
    if (w.has("events")) pages.push({ id: "events", l: "Events" });
    if (w.has("parties")) pages.push({ id: "parties", l: "Parties" });
    if (w.has("service")) pages.push({ id: "service", l: "Service" });
    if (w.has("docs")) pages.push({ id: "docs", l: "Docs" });
    if (w.has("communications")) pages.push({ id: "communications", l: "Announcements" });
    if (w.has("tasks")) pages.push({ id: "tasks", l: "Tasks" });
  }
  return pages;
}

function Sec({
  title,
  pending,
  flash,
  children,
}: {
  title: string;
  pending?: boolean;
  flash?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`sheet-sec${pending ? " pending" : ""}${flash ? " flash" : ""}`}>
      <h6>{title}</h6>
      {children}
    </div>
  );
}

export function BlueprintSheet({ draft, flash }: { draft: Draft; flash: SheetFlash }) {
  const named = !!draft.name.trim();
  const isFlash = (section: string) => flash?.section === section;

  return (
    <div className="sheet-wrap">
      <div className="sheet-cap">Your blueprint — assembling as you answer</div>
      <div className="sheet">
        <div className="sheet-head">
          <OrgMark name={draft.name} logoUrl={draft.logoDataUrl} />
          <div className="sheet-title">
            {named ? (
              <div className="nm">{draft.name.trim()}</div>
            ) : (
              <div className="nm ghost">Your organization</div>
            )}
            <div className="sl">
              {named
                ? `${DISPLAY_HOST}/${draftSlug(draft)} · reserved while you set up`
                : "the sheet fills in as we talk"}
            </div>
          </div>
        </div>

        {draft.kind ? (
          <Sec title="Pages" flash={isFlash("pages")}>
            <div className="pg-chips">
              {pageChips(draft).map(p => (
                <span key={p.id} className="pg">
                  <span className="dot" />
                  {p.l}
                </span>
              ))}
            </div>
          </Sec>
        ) : (
          <Sec title="Pages" pending>
            <span className="pend">your pages appear as we talk — only what you need</span>
          </Sec>
        )}

        {draft.kind ? (
          <Sec title="Your words" flash={isFlash("words")}>
            <div className="words-line">
              {draftVocab(draft, "Member", true)}
              <span>·</span>
              {draftVocab(draft, "Meetings")}
              <span>·</span>
              {draftVocab(draft, "Period")}
            </div>
          </Sec>
        ) : (
          <Sec title="Your words" pending>
            <span className="pend">the words you already use — I&rsquo;ll match them</span>
          </Sec>
        )}


        {draft.kind && (
          <Sec title="Tracking" flash={isFlash("metrics")}>
            <div className="pg-chips">
              {BUILTIN_METRIC_IDS.filter(id => draft.metrics[id]).map(id => (
                <span key={id} className="pg">
                  <span className="dot" />
                  {BUILTIN_METRIC_LABEL[id]}
                </span>
              ))}
              {draft.metrics.custom.map((m, i) => (
                <span key={`${m.name}-${i}`} className="pg">
                  <span className="dot" />
                  {m.name}
                </span>
              ))}
              {!BUILTIN_METRIC_IDS.some(id => draft.metrics[id]) && draft.metrics.custom.length === 0 && (
                <span className="pend">nothing tracked per {draftVocab(draft, "Member").toLowerCase()}</span>
              )}
            </div>
          </Sec>
        )}

        {draft.seats.length > 0 && (
          <Sec title="Leadership" flash={isFlash("seats")}>
            <div className="sheet-line">
              <span className="dot" />
              <span>
                <b>{draft.seats[0]!.title}</b> — you
                {draft.seats.length > 1 && (
                  <> · {draft.seats.slice(1).map(s => s.title).join(", ")} seats ready</>
                )}
              </span>
            </div>
          </Sec>
        )}

        <div className="sheet-foot">
          blueprint · nothing built yet — you review every line before anything is created
        </div>
      </div>
    </div>
  );
}
