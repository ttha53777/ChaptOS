"use client";

// The peek — the detail behind a tapped answer row.
//
// A result row used to be a question launcher: tapping "Marcus Reed · $250" sent
// a follow-up question, spent a full model turn re-deriving what the DB already
// knew, and pushed the answer you were reading off screen. The chevron promised
// a drill-down and delivered another wait. This is the drill-down.
//
// It slides over the thread rather than replacing it — the conversation is still
// underneath, at its scroll position, one Back away. The row's own text seeds the
// header immediately, so the sheet opens with content and fills in the facts;
// there's no spinner on a blank panel.
//
// Data: GET /api/ai/peek (lib/services/peek-service). The model is not involved.

import { useEffect, useState } from "react";
import { orgFetch } from "../../lib/api";
import { IcChev } from "./icons";
import { PeekCardBody } from "./PeekCardBody";
import type { AnswerRow, EntityRef, PeekCard, RefType } from "./types";
import { orgHref } from "@/lib/org-paths";

export type { PeekCard } from "./types";

/** What the row already showed — the header content before the fetch lands. */
export interface PeekSeed {
  title: string;
  subtitle?: string;
  kind: AnswerRow["kind"];
  ask?: string;
}

/** Where the full record lives, for the "open the real page" escape hatch. */
const PAGE: Record<RefType, { path: string; label: string }> = {
  member: { path: "brothers", label: "Open in Roster" },
  event:  { path: "events",   label: "Open in Events" },
  task:   { path: "tasks",    label: "Open in Timeline" },
  transaction: { path: "treasury", label: "Open in Treasury" },
};

export function PeekSheet({ refr, seed, slug, onBack, onAsk }: {
  refr: EntityRef;
  seed: PeekSeed;
  /** Active org slug, for the deep link. Omitted → no link rendered. */
  slug?: string;
  onBack: () => void;
  onAsk: (q: string) => void;
}) {
  const [card, setCard] = useState<PeekCard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCard(null);
    setFailed(false);
    orgFetch(`/api/ai/peek?type=${refr.type}&id=${refr.id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: PeekCard) => { if (!cancelled) setCard(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [refr.type, refr.id]);

  const page = PAGE[refr.type];
  const title = card?.title ?? seed.title;
  const subtitle = card?.subtitle ?? seed.subtitle;

  return (
    <div className="cs-peek" role="region" aria-label={title}>
      <div className="peek-hd">
        <button type="button" className="peek-back" onClick={onBack}>
          <IcChev /> Back
        </button>
      </div>

      <div className="peek-body">
        <PeekCardBody card={card} title={title} subtitle={subtitle} kind={seed.kind} />

        {!card && !failed && <div className="peek-wait">Reading the records…</div>}
        {failed && <div className="peek-wait">Couldn&apos;t load this record.</div>}
      </div>

      <div className="peek-ft">
        {slug && (
          <a className="peek-link" href={orgHref(slug, page.path)}>{page.label} ↗</a>
        )}
        {/* The model's follow-up still has a home — as an explicit choice now,
            not as the only thing the row could do. */}
        {seed.ask && (
          <button type="button" className="chip" onClick={() => onAsk(seed.ask!)}>Ask about this</button>
        )}
      </div>
    </div>
  );
}
