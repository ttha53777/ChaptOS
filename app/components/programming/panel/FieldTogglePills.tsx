"use client";

/**
 * Choosing what the chapter collects, from the event you're looking at.
 *
 * This is an ORG-level write made from an event-scoped sheet, which is exactly
 * why the footnote below is not optional: without it, toggling "Risk form" here
 * reads as a property of this one event rather than a decision for every event
 * the chapter will ever run.
 *
 * A pill does exactly one thing: click it to start or stop collecting that
 * field. Nothing else is layered onto it — a pill that both toggled and opened
 * an editor made the commonest action ambiguous, and a rename made in passing
 * from an event sheet is a rename nobody else knows happened.
 *
 * EVERY pill toggles, including the ten built-ins. They used to be padlocked
 * because the service refused to disable them; that refusal turned out to be
 * unfounded (the stage gates read real columns, not this table) and is gone.
 * "Built-in" now means only "can't be deleted", which is a Settings concern —
 * so nothing marks them here, because from this row they behave identically.
 *
 * Adding is here, though, and inline: the moment you discover you need a field
 * is the moment you're filling one of these sheets in, and bouncing to Settings
 * loses both the sheet and the thought. Renaming, deleting and reordering stay
 * in Settings, which is what the link in the footnote is for.
 */

import { useState } from "react";
import { apiErrorMessage, requestJson } from "../../../lib/api";
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
  settingsHref,
  onChanged,
  onStatus,
  onError,
}: {
  fields: Row[];
  settingsHref: string;
  onChanged: () => void;
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const atCeiling = fields.length >= MAX_EVENT_FIELDS;

  /** Every write goes through here so one failure path surfaces the API's words. */
  async function mutate(run: () => Promise<unknown>, ok: string) {
    if (busy) return false;
    setBusy(true);
    try {
      await run();
      onChanged();
      onStatus(ok);
      return true;
    } catch (err) {
      onError(apiErrorMessage(err, "Could not save the change."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function toggle(f: Row) {
    void mutate(
      () => requestJson(`/api/events/fields/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !f.enabled }),
      }),
      f.enabled
        // The second half of this sentence is the OFF ≠ DELETE promise, and
        // it has to be said: an officer who thinks turning a field off throws
        // away a term of answers will never turn one off.
        ? `${f.label} is no longer collected. Existing answers are kept.`
        : `${f.label} is collected on every event again.`,
    );
  }

  const label = draft?.label.trim() ?? "";
  // Collisions are checked against the LABEL, since that's what a person sees —
  // two fields both called "Contact" is the confusing part, not the slug. The
  // API decides for real; this only keeps Save from being offered.
  const clash = label.length > 0 && fields.some(f => f.label.toLowerCase() === label.toLowerCase());

  async function saveDraft() {
    if (!draft || !label || clash) return;
    const ok = await mutate(
      () => requestJson("/api/events/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, kind: draft.kind }),
      }),
      `${label} is now collected on every event.`,
    );
    if (ok) setDraft(null);
  }

  return (
    <div className="ev-fp">
      <div className="ev-fp-pills">
        {/* Every pill toggles, built-in or not. A built-in is only "reserved" in
            the sense that it can't be DELETED — which is a Settings concern and
            not something this row has to express. Padlocking them here made a
            chapter that doesn't do dress codes carry a dress-code row forever. */}
        {fields.map(f => (
          <button
            key={f.id}
            type="button"
            disabled={busy}
            aria-pressed={f.enabled}
            onClick={() => toggle(f)}
            title={
              f.enabled
                ? "Click to stop collecting this field. Answers already given are kept."
                : "Click to collect this field on every event"
            }
            className={`ev-fp-pill${f.enabled ? " on" : ""}`}
          >
            {f.label}
          </button>
        ))}
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

      <p className="ev-fp-note">
        Set once for the chapter, not per event — every event gets the same sheet.{" "}
        <a href={settingsHref}>Rename or remove fields in Settings</a>.
      </p>
    </div>
  );
}
