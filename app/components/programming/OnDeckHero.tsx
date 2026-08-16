"use client";

/**
 * The on-deck hero — the next event, and the one thing it still owes.
 *
 * Split out of the events page, which had grown past a thousand lines. This is
 * the surface that answers "what's next?", so it shows every field the next lane
 * requires — answered or not — rather than only the gaps: seeing that the date
 * and location are already in makes the missing owner legible as the last step
 * rather than an isolated complaint.
 */

import type { ProgrammingTask } from "../../data";
import { fmt$, fmtDate } from "../../data";
import {
  fieldsFor,
  hasRequiredField,
  missingFor,
  type RequiredField,
} from "@/lib/programming";
import { ownerLabel } from "@/lib/event-owner";
import { STAGE_LABELS, type ProgrammingStage } from "@/lib/state/programming-stage";
import { daysUntil, whenLabel } from "./eventsCopy";

/**
 * The lane this event is trying to enter next, and what it still owes to get
 * there. Null once an event is Confirmed or Done — those are settled, and the
 * hero has nothing to ask for.
 */
function heroGate(event: ProgrammingTask): { next: ProgrammingStage; missing: RequiredField[] } | null {
  const next: ProgrammingStage | null =
    event.stage === "idea" ? "planning" : event.stage === "planning" ? "confirmed" : null;
  return next ? { next, missing: missingFor(event, next) } : null;
}

/** Contextual hero CTA: names the first missing FIELD; all open the inspector. */
function heroCta(gate: ReturnType<typeof heroGate>): { label: string; icon: "owner" | "date" | "check" } {
  const first = gate?.missing[0];
  if (first?.key === "owner")    return { label: "Give it an owner", icon: "owner" };
  if (first?.key === "date")     return { label: "Set the date", icon: "date" };
  if (first?.key === "location") return { label: "Set the location", icon: "date" };
  return { label: "Open event", icon: "check" };
}

export function OnDeckHero({ event, today, onOpen }: { event: ProgrammingTask; today: string; onOpen: () => void }) {
  const gate = heroGate(event);
  const cta = heroCta(gate);
  // Every required field for the lane it's reaching for, answered or not — so
  // the hero shows the whole bar, not only the gaps. Replaced a four-item prep
  // meter whose items were the same for every org on the platform.
  const checks = gate
    ? fieldsFor(gate.next).map(f => ({ field: f, done: hasRequiredField(event, f.key) }))
    : [];
  const done = checks.filter(c => c.done).length;
  const total = checks.length;
  const full = total > 0 && done === total;
  const days = event.dueDate ? daysUntil(event.dueDate, today) : null;
  const cnt = days != null ? (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`) : null;

  const whenLine = [
    event.dueDate ? fmtDate(event.dueDate) : null,
    event.time ?? null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <div className="ev-sec">
        <h2>On deck</h2>
        <span className="rule" />
        {cnt && <span className="cnt">{cnt}</span>}
      </div>

      <div className="ev-hero">
        <div className="od-top">
          <span className="pill">Next event</span>
          <span className="typ">{event.type}</span>
          <span className="when">{whenLine || "No date"}</span>
        </div>
        <h3>{event.title}</h3>
        <p className="meta">
          {event.location && <span><b>{event.location}</b></span>}
          {event.collab && <><span>·</span><span>w/ <b>{event.collab}</b></span></>}
          {event.owner && <><span>·</span><span>Owner <b>{ownerLabel(event.owner)}</b></span></>}
          {event.spendingCents > 0 && <><span>·</span><span>Budget <b>{fmt$(event.spendingCents / 100)}</b></span></>}
        </p>

        {gate && total > 0 && (
          <div className="ev-prep">
            <div className="p-head">
              <span className="p-lbl">To reach {STAGE_LABELS[gate.next]}</span>
              <span className="p-count"><b>{done}</b> / {total} answered</span>
              <span className={`p-state ${full ? "ok" : "warn"}`}>{full ? "✓ Ready" : `${total - done} to go`}</span>
            </div>
            <div className="ev-pchecks">
              {checks.map(c => (
                <div key={c.field.key} className={`ev-pcheck ${c.done ? "done" : "block"}`}>
                  <div className="pc-ico">
                    {c.done ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                    )}
                    <span className="pc-k">{c.field.label}</span>
                  </div>
                  <div className="pc-v">{fieldValueLabel(c.field.key, event)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {gate && gate.missing.length > 0 && (
          <div className="ev-blocker">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
            <p>
              <b>Needs {gate.missing.map(f => f.label.toLowerCase()).join(" + ")}.</b>{" "}
              {blockerTail(gate.next, days)}
            </p>
          </div>
        )}

        <div className="actions">
          <button className="ev-btn-primary" onClick={onOpen}>
            <CtaIcon icon={cta.icon} />
            {cta.label}
          </button>
          {/* The ghost button is the same destination said plainly, so it only
              earns its place when the primary is asking for something specific.
              A settled event's CTA already reads "Open event" — showing it twice
              is two buttons that do one thing. */}
          {cta.icon !== "check" && (
            <button className="ev-btn-ghost" onClick={onOpen}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              Open event
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** The answer itself, where there is one — a date reads better than "Done". */
function fieldValueLabel(key: RequiredField["key"], event: ProgrammingTask): string {
  switch (key) {
    case "title":     return event.title || "Untitled";
    case "category":  return event.type;
    case "owner":     return event.owner ? ownerLabel(event.owner) ?? "—" : "Nobody yet";
    case "date":      return event.dueDate ? fmtDate(event.dueDate) : "Not set";
    case "location":  return event.location || "Not set";
    case "mandatory": return event.mandatory ? "Required" : "Optional";
  }
}

/**
 * The consequence half of the blocker line. Confirmed is the lane that publishes
 * to the whole chapter, so it is worth saying so — that is the cost the two extra
 * fields are buying.
 */
function blockerTail(next: ProgrammingStage, days: number | null): string {
  const window = days != null && days >= 0
    ? days === 0 ? "It's today" : `It's in ${days} day${days === 1 ? "" : "s"}`
    : "No date on it yet";
  return next === "confirmed"
    ? `${window} — confirming puts it on the whole chapter's timeline.`
    : `${window} — an event in planning belongs to somebody.`;
}

function CtaIcon({ icon }: { icon: "owner" | "date" | "check" }) {
  if (icon === "owner") {
    // A person, for "give it an owner".
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>;
  }
  if (icon === "date") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18M8 3v4M16 3v4" /><rect x="3" y="5" width="18" height="16" rx="2" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
}
