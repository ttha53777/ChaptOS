"use client";

/**
 * The live blueprint sheet — the right-hand pane that assembles as the founder
 * names the org and answers the interview. Sections: head, Pages, Your words,
 * This term, Tracking, Leadership. `flash` briefly highlights the section that
 * just changed.
 */

import type { Draft } from "@/lib/onboarding/draft";
import { BUILTIN_METRIC_IDS, BUILTIN_METRIC_LABEL } from "@/lib/onboarding/kinds";
import { DISPLAY_HOST, draftSlug, draftVocab, wfSet } from "./flow-state";
import { OrgMark } from "./OrgMark";

export type SheetFlash =
  | { section: "pages" | "words" | "seats" | "name" | "metrics"; key: number }
  | null;

function pageChips(draft: Draft): { k: string; l: string; locked?: boolean }[] {
  const w = wfSet(draft);
  const v = (key: Parameters<typeof draftVocab>[1], plural = false) => draftVocab(draft, key, plural);
  const pages: { k: string; l: string; locked?: boolean }[] = [
    { k: "operations", l: "Dashboard", locked: true },
    { k: "operations", l: "Timeline", locked: true },
  ];
  if (draft.kind) {
    if (w.has("meetings")) pages.push({ k: "meetings", l: v("Meetings") });
    if (w.has("members")) pages.push({ k: "members", l: v("Member", true) });
    if (w.has("finance")) pages.push({ k: "finance", l: v("Dues") });
    if (w.has("attendance")) pages.push({ k: "attendance", l: "Attendance" });
    if (w.has("events")) pages.push({ k: "events", l: "Events" });
    if (w.has("parties")) pages.push({ k: "parties", l: "Parties" });
    if (w.has("service")) pages.push({ k: "service", l: "Service" });
    if (w.has("docs")) pages.push({ k: "docs", l: "Docs" });
    if (w.has("communications")) pages.push({ k: "communications", l: "Announcements" });
    if (w.has("tasks")) pages.push({ k: "tasks", l: "Tasks" });
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
          <Sec title="Pages" flash={isFlash("pages")} key={`pages-${flash?.key ?? 0}`}>
            <div className="pg-chips">
              {pageChips(draft).map((p, i) => (
                <span key={p.l} className="pg" style={{ animationDelay: `${i * 45}ms` }}>
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
          <Sec title="Your words" flash={isFlash("words")} key={`words-${flash?.key ?? 0}`}>
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
          <Sec title="Tracking" flash={isFlash("metrics")} key={`metrics-${flash?.key ?? 0}`}>
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
          <Sec title="Leadership" flash={isFlash("seats")} key={`seats-${flash?.key ?? 0}`}>
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
