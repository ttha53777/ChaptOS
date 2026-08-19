"use client";

/**
 * Which optional fields THIS event collects.
 *
 * The scope question is the whole design here. Clicking a pill attaches or
 * detaches the field for the event in front of you and nothing else — the org's
 * other events are untouched. Settings owns the menu: which fields exist, and
 * which a NEW event starts with. This row owns the exceptions.
 *
 * Only the exceptions are stored (ProgrammingEvent.detachedFields), so turning a
 * new field on for the chapter still reaches every event that never expressed an
 * opinion, without a backfill.
 *
 * A pill does exactly one thing: click it to attach or detach. Nothing else is
 * layered onto it — a pill that both toggled and opened an editor made the
 * commonest action ambiguous, and a rename made in passing from an event sheet
 * is a rename nobody else knows happened.
 *
 * DETACHING CLEARS THIS EVENT'S ANSWER, which is where this parts company with
 * the org-level switch's OFF ≠ DELETE promise. Org-off is reversible bookkeeping
 * about the whole chapter, so it preserves; detaching is a claim that the field
 * was never part of this event, and a hidden answer waiting to resurface on
 * reattach is worse than an honest one. So an answered field warns first — the
 * loss is chosen, never discovered. Unanswered fields detach silently, because
 * there is nothing to lose and a confirm on every click is noise.
 *
 * Adding is here too, and inline: the moment you discover you need a field is
 * the moment you're filling one of these sheets in, and bouncing to Settings
 * loses both the sheet and the thought. A field created here lands on the org
 * menu and attaches to this event. Renaming, deleting and reordering stay in
 * Settings, which is what the link in the footnote is for.
 */

import { useState } from "react";
import { apiErrorMessage, requestJson } from "../../../lib/api";
import { ConfirmDialog } from "../../dashboard/primitives";
import {
  FIELD_KINDS,
  MAX_EVENT_FIELDS,
  MAX_FIELD_LABEL,
  type EventFieldDef,
  type FieldKind,
} from "@/lib/event-fields";

type Row = EventFieldDef & { id: number };

/** What each kind collects, in the officer's words rather than the schema's. */
const KIND_COPY: Record<FieldKind, { label: string; eg: string }> = {
  text:   { label: "Text",     eg: "Anything written — a contact, a note, a dress code." },
  num:    { label: "Number",   eg: "A count. Head count, buses, tables." },
  money:  { label: "Money",    eg: "A dollar amount, kept apart from what was actually spent." },
  bool:   { label: "Yes / no", eg: "A box that's either ticked or it isn't. Risk form filed?" },
  date:   { label: "Date",     eg: "A second date the event depends on — a deposit deadline." },
  person: { label: "Person",   eg: "Somebody on the roster who isn't the owner." },
  file:   { label: "File",     eg: "A link or an attachment." },
};

/** `null` = composer closed. Only ever writes a NEW field. */
type Draft = { label: string; kind: FieldKind };

export function FieldTogglePills({
  fields,
  detached,
  isAnswered,
  onSetDetached,
  settingsHref,
  onChanged,
  onStatus,
  onError,
}: {
  /** The org's ENABLED fields — the menu this event picks from. */
  fields: Row[];
  /** Slugs this event has opted out of. */
  detached: string[];
  /** Whether detaching would cost an answer, so the click knows to warn. */
  isAnswered: (def: Row) => boolean;
  /** Persist the whole opt-out set for this event. */
  onSetDetached: (next: string[]) => Promise<void>;
  settingsHref: string;
  onChanged: () => void;
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDetach, setConfirmDetach] = useState<Row | null>(null);

  const off = new Set(detached);
  const atCeiling = fields.length >= MAX_EVENT_FIELDS;

  /** Every write goes through here so one failure path surfaces the API's words. */
  async function mutate(run: () => Promise<unknown>, ok: string) {
    if (busy) return false;
    setBusy(true);
    try {
      await run();
      onStatus(ok);
      return true;
    } catch (err) {
      onError(apiErrorMessage(err, "Could not save the change."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Write the opt-out set with one slug flipped. Sent whole, never as a delta. */
  function setAttached(f: Row, attached: boolean) {
    const next = new Set(off);
    if (attached) next.delete(f.slug);
    else next.add(f.slug);
    return mutate(
      () => onSetDetached([...next].sort()),
      attached
        ? `${f.label} is collected on this event.`
        // Named as this-event-only, because the same words on an org switch
        // would mean something much larger and the officer can't see which
        // scope they just wrote.
        : `${f.label} is off for this event. Other events keep it.`,
    );
  }

  function toggle(f: Row) {
    if (busy) return;
    const attached = !off.has(f.slug);
    // Detaching an ANSWERED field destroys that answer, so it asks first.
    // Attaching, and detaching an empty field, cost nothing and go straight
    // through — a confirm on every click trains people to dismiss confirms.
    if (attached && isAnswered(f)) {
      setConfirmDetach(f);
      return;
    }
    void setAttached(f, !attached);
  }

  const label = draft?.label.trim() ?? "";
  // Collisions are checked against the LABEL, since that's what a person sees —
  // two fields both called "Contact" is the confusing part, not the slug. The
  // API decides for real; this only keeps Save from being offered.
  const clash = label.length > 0 && fields.some(f => f.label.toLowerCase() === label.toLowerCase());

  async function saveDraft() {
    if (!draft || !label || clash) return;
    // A new field is created enabled, so it lands on the org menu AND attaches
    // here without a second write — which is what the officer meant by adding it
    // from this sheet. Other events pick it up by the same default.
    const ok = await mutate(
      () => requestJson("/api/events/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, kind: draft.kind }),
      }),
      `${label} added, and collected on this event.`,
    );
    if (ok) { setDraft(null); onChanged(); }
  }

  return (
    <div className="ev-fp">
      <div className="ev-fp-pills">
        {/* Every pill toggles, built-in or not. A built-in is only "reserved" in
            the sense that it can't be DELETED — which is a Settings concern and
            not something this row has to express. Padlocking them here made a
            chapter that doesn't do dress codes carry a dress-code row forever. */}
        {fields.map(f => {
          const attached = !off.has(f.slug);
          return (
            <button
              key={f.id}
              type="button"
              disabled={busy}
              aria-pressed={attached}
              onClick={() => toggle(f)}
              title={
                attached
                  ? isAnswered(f)
                    ? `Click to take ${f.label} off this event. Its answer here is cleared.`
                    : `Click to take ${f.label} off this event`
                  : `Click to collect ${f.label} on this event`
              }
              className={`ev-fp-pill${attached ? " on" : ""}`}
            >
              {f.label}
            </button>
          );
        })}
        {!draft && (
          <button
            type="button"
            className="ev-fp-add"
            disabled={atCeiling || busy}
            onClick={() => setDraft({ label: "", kind: "text" })}
            title={atCeiling ? `A chapter can collect at most ${MAX_EVENT_FIELDS} fields.` : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New field
          </button>
        )}
      </div>

      {draft && (
        <div className="ev-fn">
          <p className="ev-fn-k">New field for every event</p>
          <input
            autoFocus
            type="text"
            className="ev-fn-input"
            maxLength={MAX_FIELD_LABEL}
            placeholder="Beneficiary, Bus company, DJ contact…"
            autoComplete="off"
            value={draft.label}
            onChange={e => setDraft({ ...draft, label: e.target.value })}
            onKeyDown={e => {
              if (e.key === "Escape") setDraft(null);
              if (e.key === "Enter") { e.preventDefault(); void saveDraft(); }
            }}
          />

          <p className="ev-fn-sub">What kind of answer</p>
          <div className="ev-fn-kinds">
            {FIELD_KINDS.map(k => (
              <button
                key={k}
                type="button"
                className={`ev-fn-kind${draft.kind === k ? " on" : ""}`}
                disabled={busy}
                onClick={() => setDraft({ ...draft, kind: k })}
              >
                {KIND_COPY[k].label}
              </button>
            ))}
          </div>
          <p className="ev-fn-eg">
            <b>{KIND_COPY[draft.kind].label}.</b> {KIND_COPY[draft.kind].eg}
          </p>
          {/* Said before the field exists, because after it exists this is only
              enforceable by refusing — the kind can't change once events have
              answered it, and an answered field that changes type has no safe
              reading. */}
          <p className="ev-fn-eg">
            A field&apos;s type is fixed once events start answering it.
          </p>
          {clash && (
            <p className="ev-fn-err">There&apos;s already a field called &ldquo;{label}&rdquo;.</p>
          )}

          <div className="ev-fn-foot">
            <span className="ev-fn-sp" />
            <button type="button" className="ev-fn-btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="ev-fn-btn go"
              disabled={!label || clash || busy}
              onClick={() => void saveDraft()}
            >
              Add field
            </button>
          </div>
        </div>
      )}

      {/* The scope sentence, which is the one thing this row must never leave
          implicit: the pills above look identical to the org-wide switch they
          replaced, so the note has to say which one you're touching. */}
      <p className="ev-fp-note">
        This event only — other events keep what they collect.{" "}
        <a href={settingsHref}>Add, rename or reorder fields in Settings</a>.
      </p>

      {confirmDetach && (
        <ConfirmDialog
          tone="dusk"
          title={`Take “${confirmDetach.label}” off this event?`}
          message={
            `${confirmDetach.label} is answered on this event, and that answer is deleted. ` +
            "Other events keep the field and their own answers."
          }
          confirmLabel="Take it off"
          onConfirm={() => {
            const target = confirmDetach;
            setConfirmDetach(null);
            void setAttached(target, false);
          }}
          onCancel={() => setConfirmDetach(null)}
        />
      )}
    </div>
  );
}
