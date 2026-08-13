"use client";

// The event-idea panel — the drill-down behind a tapped programming suggestion.
//
// An advisory answer about programming ends in rows like "Weekly Brotherhood
// Dinner": a whole event compressed into a title and a clause. Those rows used
// to navigate to the Events screen, which is where the idea went to die — the
// officer arrived at an empty calendar holding nothing but a remembered phrase
// and had to retype the idea as a form.
//
// This panel is the rest of the thought. It slides over the thread (never a
// route change, never a modal): the conversation stays mounted underneath at its
// scroll position, so Back is a return rather than a re-render, exactly as the
// PeekSheet behaves. The header seeds from the row's own text, so the panel is
// never blank while the request is in flight.
//
// Two things arrive from POST /api/ai/event-idea: prose explaining the idea in
// enough depth to decide on it, and a server-SIGNED proposal card prefilled with
// what could be known safely. The card is minted server-side for the same reason
// every other writ card is — its permission gate and HMAC are what make the
// approval record trustworthy, and a card the client assembled could claim
// anything.

import { useEffect, useMemo, useState } from "react";
import { orgFetch } from "../../lib/api";
import { IcChev, IcSpark } from "./icons";
import { EventDraftCard, draftMissing, type DraftCategory, type EventDraft } from "./EventDraftCard";
import type { ProposalCard } from "./types";

/** What the row already showed — the header content before the fetch lands. */
export interface EventIdeaSeed {
  title: string;
  subtitle?: string;
  /** The question that produced the row, for grounding the explanation. */
  question?: string;
}

interface EventIdeaResponse {
  title: string;
  explanation: string;
  categories: DraftCategory[];
  category: string | null;
  proposal: (Omit<ProposalCard, "id" | "state"> & Record<string, unknown>) | null;
  blocked?: string;
}

/** The blank the server signs its draft against; never a real date. See the service. */
const PLACEHOLDER_DATE = "1970-01-01";

/**
 * Split the model's prose into paragraphs. Plain text nodes throughout — the
 * explanation is model output and is never parsed as markup.
 */
function paragraphs(text: string): string[] {
  return text.split(/\n{2,}/).map(p => p.trim().replace(/\s+/g, " ")).filter(Boolean);
}

export function EventIdeaPanel({ seed, onBack, onCreated }: {
  seed: EventIdeaSeed;
  onBack: () => void;
  /** Confirmed and written — hands the new event's id to the host for the Timeline hop. */
  onCreated: (eventId: number | null, payload: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState<EventIdeaResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>({
    title: seed.title, date: "", time: "", category: "", location: "", description: "", mandatory: false,
  });
  const [card, setCard] = useState<ProposalCard | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(null);
    orgFetch("/api/ai/event-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: seed.title,
        ...(seed.subtitle ? { subtitle: seed.subtitle } : {}),
        ...(seed.question ? { question: seed.question } : {}),
      }),
    })
      .then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`))))
      .then((d: EventIdeaResponse) => {
        if (cancelled) return;
        setData(d);
        // Adopt only what the server was willing to prefill. The date it signed
        // the draft against is a placeholder by construction, so it is dropped
        // here rather than shown — the whole point is that this field is blank
        // until a human fills it.
        const payload = (d.proposal?.payload ?? {}) as Record<string, unknown>;
        const cat = d.category ?? "";
        setDraft(prev => ({
          ...prev,
          title: typeof payload.title === "string" ? payload.title : d.title,
          category: cat,
          mandatory: cat === "chapter" || (d.categories.find(c => c.slug === cat)?.mandatoryDefault ?? false),
        }));
        if (d.proposal) {
          setCard({
            ...(d.proposal as unknown as ProposalCard),
            id: `idea-${Date.now()}`,
            state: "pending",
          });
        }
      })
      .catch((e: Error) => { if (!cancelled) setFailed(e.message || "Couldn't open this idea."); });
    return () => { cancelled = true; };
  }, [seed.title, seed.subtitle, seed.question]);

  const paras = useMemo(() => paragraphs(data?.explanation ?? ""), [data?.explanation]);

  async function confirm() {
    if (!card || draftMissing(draft).length > 0 || !card.perm.canApprove) return;
    setCard(c => (c ? { ...c, state: "confirming" } : c));

    // The posted body is the EDITED draft, not the signed placeholder payload —
    // the signature attests what was proposed; the user's edits are what gets
    // booked, and /api/calendar re-validates and re-authorizes all of it.
    const payload: Record<string, unknown> = {
      title: draft.title.trim(),
      date: draft.date,
      category: draft.category,
      mandatory: draft.mandatory,
      ...(draft.time ? { time: draft.time } : {}),
      ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    };

    try {
      const res = await orgFetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setCard(c => (c ? {
          ...c,
          state: "error",
          resultMessage: res.status === 403 ? "Your account can't add events." : (body.error ?? `Failed (HTTP ${res.status}).`),
        } : c));
        return;
      }
      let eventId: number | null = null;
      try {
        const body = await res.clone().json() as { id?: unknown };
        if (typeof body?.id === "number") eventId = body.id;
      } catch { /* no JSON id — the audit row just goes unrecorded */ }

      // Record the approval (fire-and-forget: the event already exists, and a
      // missing audit row must not undo it or block the hop to the calendar).
      if (eventId !== null) {
        void orgFetch("/api/ai/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "event_idea", eventId }),
        }).catch(() => { /* audit record is best-effort */ });
      }
      onCreated(eventId, payload);
    } catch (e) {
      setCard(c => (c ? { ...c, state: "error", resultMessage: e instanceof Error ? e.message : "Network error." } : c));
    }
  }

  return (
    <div className="cs-idea" role="region" aria-label={seed.title}>
      <div className="peek-hd">
        <button type="button" className="peek-back" onClick={onBack}>
          <IcChev /> Back
        </button>
      </div>

      <div className="peek-body idea-body">
        <div className="idea-id">
          <span className="ispark"><IcSpark size={15} /></span>
          <span className="peek-name">
            <span className="t">{data?.title ?? seed.title}</span>
            {seed.subtitle && <span className="s">{seed.subtitle}</span>}
          </span>
        </div>

        {/* The reasoning leads, but only its opening paragraph: the full three
            push the proposal card a screen below the fold, which inverts the
            panel — the argument is why you'd act, the card is the acting, and a
            panel that opens as an essay reads as something to finish rather
            than something to do. The rest is one tap away and stays expanded. */}
        <div className="idea-why">
          {paras.length > 0 ? (
            <>
              {(expanded ? paras : paras.slice(0, 1)).map((p, i) => (
                <p key={i} className={`iwhy in in-${Math.min(i + 2, 4)}`}>{p}</p>
              ))}
              {!expanded && paras.length > 1 && (
                <button type="button" className="imore" onClick={() => setExpanded(true)}>
                  Read the rest
                </button>
              )}
            </>
          ) : data ? null : failed ? null : (
            // The row's own clause holds the space until the prose lands, so the
            // panel opens with something true rather than a spinner.
            <p className="iwait">Thinking this one through…</p>
          )}
        </div>

        {failed && <div className="peek-wait">{failed}</div>}
        {data && !data.proposal && (
          <div className="peek-wait">{data.blocked ?? "This idea can't be turned into an event here."}</div>
        )}

        {card && data && (
          <div className="idea-draft in in-4">
            <EventDraftCard
              card={card}
              categories={data.categories}
              draft={draft}
              onChange={setDraft}
              onConfirm={() => void confirm()}
              onDiscard={onBack}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export { PLACEHOLDER_DATE };
