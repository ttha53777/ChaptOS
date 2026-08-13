"use client";

// The editable writ — a proposal card you fill in before you approve it.
//
// The shipped WritCard shows a finished draft: the model already knew the date
// and the title, so the card's only job was to be read and ratified. This card
// is the same object one step earlier, when half of it is still unknown, and it
// keeps the same grammar (mono key column, violet Proposal tag, permission line,
// the Approve/Discard foot) so the two read as one family — the difference is
// that the value column here is typed into rather than merely read.
//
// The empty fields are the point. Everything the model could safely infer is
// prefilled — the title, and a category that renders as a visible chip so a
// wrong guess is one tap from right. Everything else opens blank, because a
// guessed date in a filled-looking field is a wrong answer wearing the costume
// of a right one, and the only thing standing between it and a real calendar is
// a user who trusts the form. So `date` is marked Needed rather than defaulted,
// and Confirm stays locked, naming what it is waiting for.

import { useMemo, useState } from "react";

import { IcCal, IcClock, IcLock, IcPin, IcText, IcTick } from "./icons";
import type { ProposalCard } from "./types";

/** The org's event types, as the chip row needs them. */
export interface DraftCategory {
  slug: string;
  label: string;
  mandatoryDefault: boolean;
}

/** The user-editable half of a calendar-event payload. */
export interface EventDraft {
  title: string;
  date: string;      // YYYY-MM-DD, "" until picked
  time: string;
  category: string;  // slug, "" until picked
  location: string;
  description: string;
  mandatory: boolean;
}

/**
 * Fields that must hold a value before this can be posted. Mirrors
 * createCalendarInput (title, date, category) — the server re-validates, so
 * this exists to explain the lock, not to be the only thing enforcing it.
 */
export function draftMissing(draft: EventDraft): string[] {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push("a title");
  if (!draft.date) missing.push("a date");
  if (!draft.category) missing.push("a category");
  return missing;
}

/** "2026-08-21" → "Thu, Aug 21" — the date read back the way a human wrote it. */
function readableDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Today in the user's own timezone, as the date input's floor. */
function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Field({ icon, label, needed, filled, children }: {
  icon: React.ReactNode;
  label: string;
  /** Required and still empty — the quiet marker that explains the locked foot. */
  needed?: boolean;
  filled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`efield${filled ? " filled" : ""}${needed ? " needed" : ""}`}>
      <span className="ek"><i className="eg">{icon}</i>{label}</span>
      <span className="ev">{children}</span>
      {needed && <span className="eneed">Needed</span>}
    </div>
  );
}

export function EventDraftCard({ card, categories, draft, onChange, onConfirm, onDiscard }: {
  /** The server-signed proposal this card edits. Its permission gate is authoritative. */
  card: ProposalCard;
  categories: DraftCategory[];
  draft: EventDraft;
  onChange: (next: EventDraft) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const blocked = !card.perm.canApprove;
  const settled = card.state === "approved" || card.state === "discarded" || card.state === "dismissed" || card.state === "error";
  const missing = useMemo(() => draftMissing(draft), [draft]);
  const set = (patch: Partial<EventDraft>) => onChange({ ...draft, ...patch });

  // Picking a category adopts that type's mandatory default — chapter events
  // must be mandatory (the server refuses otherwise), so the toggle follows the
  // chip rather than stranding the user on a combination that can't post.
  const pickCategory = (c: DraftCategory) => {
    set(c.slug === "chapter"
      ? { category: c.slug, mandatory: true }
      : { category: c.slug, mandatory: c.mandatoryDefault });
  };
  const lockedMandatory = draft.category === "chapter";

  if (settled) {
    const approved = card.state === "approved";
    return (
      <div className="writ edraft">
        <div className={`settled${approved ? "" : " declined"}`}>
          <span className="tk">{approved ? <IcTick /> : <>—</>}</span>
          <span className="txt">{card.resultMessage}</span>
          {card.stamp && <span className="stamp">{card.stamp}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="writ edraft" data-writ="">
      <div className="wh">
        <span className="chip-tag">Proposal</span>
        <span className="what">Add a calendar event</span>
      </div>

      <div className="ebody">
        <Field icon={<IcText size={13} />} label="Title" filled={!!draft.title.trim()} needed={!draft.title.trim()}>
          <input
            className="einput"
            value={draft.title}
            placeholder="Name this event"
            maxLength={200}
            onChange={e => set({ title: e.target.value })}
          />
        </Field>

        {/* Date leads the blanks: it is the one thing the model refused to guess
            and the one thing the event can't exist without. */}
        <Field icon={<IcCal size={13} />} label="Date" filled={!!draft.date} needed={!draft.date}>
          <span className="edate">
            <input
              className="einput date"
              type="date"
              value={draft.date}
              min={todayISO()}
              onChange={e => set({ date: e.target.value })}
            />
            {draft.date && <span className="eread">{readableDate(draft.date)}</span>}
          </span>
        </Field>

        <Field icon={<IcClock size={13} />} label="Time" filled={!!draft.time}>
          <input
            className="einput time"
            type="time"
            value={draft.time}
            onChange={e => set({ time: e.target.value })}
          />
        </Field>

        <Field icon={<IcPin size={13} />} label="Location" filled={!!draft.location.trim()}>
          <input
            className="einput"
            value={draft.location}
            placeholder="Optional"
            maxLength={200}
            onChange={e => set({ location: e.target.value })}
          />
        </Field>
      </div>

      {/* Category is a chip row, not a select: the org's real types are few and
          worth seeing at once, and the prefilled guess reads as a highlighted
          pick the user can overrule rather than as a hidden default. */}
      <div className="ecats">
        <span className="ek"><i className="eg" /><span>Category</span></span>
        <div className="ecatrow">
          {categories.map(c => (
            <button
              key={c.slug}
              type="button"
              className={`chip${draft.category === c.slug ? " on" : ""}`}
              aria-pressed={draft.category === c.slug}
              onClick={() => pickCategory(c)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="emand">
        <button
          type="button"
          className={`etoggle${draft.mandatory ? " on" : ""}`}
          role="switch"
          aria-checked={draft.mandatory}
          disabled={lockedMandatory}
          onClick={() => set({ mandatory: !draft.mandatory })}
        >
          <span className="knob" />
        </button>
        <span className="elbl">
          Mandatory
          {lockedMandatory && <em> — chapter events always are</em>}
        </span>
      </div>

      {/* Notes stay folded away: an optional paragraph shouldn't be the tallest
          thing on a card whose job is a date and a category. */}
      {showNotes ? (
        <div className="enotes">
          <textarea
            className="einput area"
            value={draft.description}
            placeholder="What is this event, for whoever reads the calendar…"
            rows={3}
            maxLength={2000}
            autoFocus
            onChange={e => set({ description: e.target.value })}
          />
        </div>
      ) : (
        <button type="button" className="eadd" onClick={() => setShowNotes(true)}>
          {draft.description.trim() ? "Edit description" : "Add a description"}
        </button>
      )}

      {!blocked && (
        <div className="permline"><span className="lk"><IcLock size={11} /></span>Requires <b>{card.perm.label}</b></div>
      )}
      {blocked && (
        <div className="gate">
          <span className="lk"><IcLock /></span>
          <span className="gt">
            This needs the <b>{card.perm.label}</b> permission
            {card.perm.holders?.roleTitles?.[0] ? <> — held by the <b>{card.perm.holders.roleTitles[0]}</b></> : null}
            , which you don&apos;t have, so it can&apos;t post.
            {card.perm.holders?.memberName ? <> Ask <b>{card.perm.holders.memberName}</b> to schedule it.</> : null}
          </span>
        </div>
      )}

      {card.state === "confirming" ? (
        <div className="wfoot"><span className="wbusy"><span className="arc sm" />Adding to the calendar…</span></div>
      ) : (
        <div className="wfoot efoot">
          <button
            type="button"
            className="wbtn primary"
            disabled={blocked || missing.length > 0}
            onClick={onConfirm}
          >
            Add event
          </button>
          <button type="button" className="wbtn quiet" onClick={onDiscard}>
            {blocked ? "Dismiss" : "Discard"}
          </button>
        </div>
      )}
      {/* The lock explains itself — a disabled button with no reason reads as
          broken, and the missing field may be scrolled out of view. */}
      {!blocked && missing.length > 0 && card.state !== "confirming" && (
        <div className="eneedline">Add {missing.join(" and ")} to book this.</div>
      )}
    </div>
  );
}
