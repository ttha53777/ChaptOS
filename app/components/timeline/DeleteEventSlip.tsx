"use client";
/* The delete slip and the toasts after it (_design/Event Delete Tear Mock.html).
   The slip says what goes with the event, counted by GET /api/calendar/[id]/delete-preview,
   which is also the delete's own gate asked up front: signed out, or not allowed, and the
   slip says so with no Delete at all, so nothing is ever torn for a delete that can't
   happen. The choreography after Delete is event-delete.ts. */
import React from "react";
import { Modal } from "../dashboard/primitives";
import type { CalendarEvent } from "../../data";

/** GET /api/calendar/[id]/delete-preview (lib/services/calendar-service.ts DeletePreview). */
export interface DeletePreview {
  attendance: number;
  excuses: number;
  party: { name: string; doorRevenue: number; expenses: number; completed: boolean } | null;
  serviceMembers: number;
  programming: boolean;
  fundraiser?: { supplies: number; wrapped: boolean } | null;
  blocked: "MANAGE_PARTIES" | null;
}

export type SlipState =
  | { kind: "checking" }
  | { kind: "ready"; preview: DeletePreview }
  /** The preview didn't come back (offline, a blip): the delete itself may still work. */
  | { kind: "unknown" }
  | { kind: "blocked"; why: "signin" | "events" | "parties" };

const svg = (d: string, sw = 1.9) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <g dangerouslySetInnerHTML={{ __html: d }} />
  </svg>
);
const I = {
  trash:  () => svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>'),
  check:  () => svg('<path d="M4 12.5l4.5 4.5L20 6"/>', 2.2),
  excuse: () => svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h4"/>'),
  till:   () => svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  hand:   () => svg('<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V5a1.5 1.5 0 0 1 3 0v5M13 10V6a1.5 1.5 0 0 1 3 0v6M16 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.3 14.6a1.5 1.5 0 0 1 2.4-1.8L7 13"/>'),
  board:  () => svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>'),
  lock:   () => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  undo:   () => svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', 2),
  x:      () => svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.2),
  bang:   () => svg('<path d="M12 7v6M12 17v.5"/>', 2.6),
  wifi:   () => svg('<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19v.5M3 3l18 18"/>'),
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function chipsFor(p: DeletePreview): { cls?: string; icon: React.ReactNode; body: React.ReactNode }[] {
  const out: { cls?: string; icon: React.ReactNode; body: React.ReactNode }[] = [];
  if (p.attendance) out.push({ icon: I.check(), body: <><b>{p.attendance}</b> attendance mark{p.attendance === 1 ? "" : "s"}</> });
  if (p.excuses) out.push({ icon: I.excuse(), body: <><b>{p.excuses}</b> excuse request{p.excuses === 1 ? "" : "s"}</> });
  if (p.party) {
    const money_ = [p.party.doorRevenue ? `${money(p.party.doorRevenue)} in` : "", p.party.expenses ? `${money(p.party.expenses)} out` : ""].filter(Boolean).join(" · ");
    out.push({ cls: "ledger", icon: I.till(), body: <>Party ledger{money_ ? ` · ${money_}` : ""}</> });
  }
  if (p.serviceMembers) out.push({ icon: I.hand(), body: <>Service hours for <b>{p.serviceMembers}</b> member{p.serviceMembers === 1 ? "" : "s"}</> });
  if (p.fundraiser) out.push({ cls: "ledger", icon: I.till(), body: <>The fundraiser{p.fundraiser.supplies ? <> and its <b>{p.fundraiser.supplies}</b>-item shopping list</> : ""}{p.fundraiser.wrapped ? ", wrap-up included" : ""}</> });
  if (p.programming) out.push({ cls: "keeps", icon: I.board(), body: <>Its Programming card goes back to Ideas</> });
  return out;
}

export function DeleteEventSlip({ event, catStyle, catLabel, time, state, pressed, onKeep, onDelete, onSignIn }: {
  event: CalendarEvent;
  /** The row's category vars (catStyleOf), so the ticket's dot and date match it. */
  catStyle: React.CSSProperties;
  catLabel: string;
  time: string | null;
  state: SlipState;
  /** Delete was pressed while the preview was still out: hold the press. */
  pressed: boolean;
  onKeep: () => void;
  onDelete: () => void;
  onSignIn: () => void;
}) {
  const blocked = state.kind === "blocked" ? state.why : null;
  const dt = new Date(`${event.date}T12:00`);
  const chips = state.kind === "ready" ? chipsFor(state.preview) : [];
  return (
    <Modal hideHeader ariaLabel={blocked ? `Can't delete ${event.title}` : `Delete ${event.title}`} onClose={onKeep} accent={blocked ? "peach" : "rose"} maxWidthClass="max-w-[460px]">
      <div className={`tl-del-slip${blocked ? " blocked" : ""}`} style={catStyle}>
        <div className="ds-head">
          <span className="ds-tile">{blocked ? I.lock() : I.trash()}</span>
          <span className="ds-kick">{blocked === "signin" ? "Signed out" : blocked ? "Can’t delete" : "Delete event"}</span>
        </div>
        <h2 className="ds-title">
          {blocked === "signin" ? <>Sign in to delete <em>{event.title}</em></>
            : blocked ? <>You can’t delete <em>{event.title}</em></>
            : <>Delete <em>{event.title}</em>?</>}
        </h2>
        <div className="ds-ticket">
          <div className="ds-tk"><i /><div><b>{event.title}</b><span>{[catLabel, time].filter(Boolean).join(" · ")}</span></div></div>
          <div className="ds-stub">
            <small>{dt.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</small>
            <b>{dt.getDate()}</b>
            <small>{dt.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</small>
          </div>
        </div>
        {blocked ? (
          <p className="ds-why">
            {blocked === "signin" ? "Your session ended while this page was open. Sign in again and you’ll come back to the timeline."
              : blocked === "parties" ? "It has a party ledger, and deleting that needs Manage parties. Ask an officer who has it."
              : "Your role no longer includes managing events. Ask an officer who can."}
          </p>
        ) : (
          <div className="ds-goes">
            <span className="ds-lbl">Goes with it</span>
            <div className="ds-chips" aria-live="polite">
              {state.kind === "checking" && <span className="ds-chip wait">Counting…</span>}
              {state.kind === "unknown" && <span className="ds-chip none">Its attendance, excuses and any party ledger</span>}
              {state.kind === "ready" && (chips.length
                ? chips.map((c, n) => <span key={n} className={`ds-chip${c.cls ? ` ${c.cls}` : ""}`} style={{ animationDelay: `${n * 70}ms` }}>{c.icon}{c.body}</span>)
                : <span className="ds-chip none">Nothing yet: no attendance or excuses</span>)}
            </div>
          </div>
        )}
        <div className="ds-foot">
          <span className="ds-note">{blocked ? "Nothing was deleted." : "You’ll have a few seconds to undo."}</span>
          <div className="ds-btns">
            <button type="button" className="ds-btn" onClick={onKeep}>{blocked === "signin" ? "Cancel" : blocked ? "OK" : "Keep it"}</button>
            {blocked === "signin" && <button type="button" className="ds-btn go" onClick={onSignIn}>Sign in</button>}
            {!blocked && (
              <button type="button" className="ds-btn go" onClick={onDelete} data-pressed={pressed || undefined} aria-busy={pressed || undefined}>Delete event</button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── Toasts ─────────────────────────────────────────────────────────────────── */

export type DeleteToast =
  | { kind: "undo"; id: number; title: string; records: boolean }
  | { kind: "fail"; id: number; title: string; why: "offline" | "server" | "signin" | "events" | "parties"; message?: string }
  | { kind: "gone"; id: number; title: string };

const FAIL_COPY: Record<Extract<DeleteToast, { kind: "fail" }>["why"], { title: (t: string) => string; body: string; icon: () => React.ReactNode; hard?: boolean }> = {
  offline: { title: t => `Couldn’t delete ${t}`, body: "You’re offline. It’s back where it was.", icon: I.wifi },
  server:  { title: t => `Couldn’t delete ${t}`, body: "Something went wrong on our end. It’s back where it was.", icon: I.bang },
  signin:  { title: () => "You’ve been signed out", body: "Sign in again, then delete it. It’s back where it was.", icon: I.lock, hard: true },
  events:  { title: t => `You can’t delete ${t}`, body: "Your role no longer includes managing events.", icon: I.lock, hard: true },
  parties: { title: t => `You can’t delete ${t}`, body: "It has a party ledger, and deleting that needs Manage parties.", icon: I.lock, hard: true },
};

export function DeleteToastView({ toast, leaving, onUndo, onExpire, onRetry, onSignIn, onDismiss, onLeft }: {
  toast: DeleteToast;
  leaving: boolean;
  onUndo: () => void;
  /** The fuse burned down: send the delete. */
  onExpire: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  onDismiss: () => void;
  onLeft: () => void;
}) {
  const end = (e: React.AnimationEvent) => { if (e.animationName === "tl-del-toast-out") onLeft(); };
  if (toast.kind === "undo") {
    return (
      <div className={`tl-del-toast undo${leaving ? " bye" : ""}`} role="status" onAnimationEnd={end}>
        <span className="ic">{I.trash()}</span>
        <div className="tx"><b>{toast.title} deleted</b><span>{toast.records ? "Its records went with it." : "Off the timeline."}</span></div>
        <button type="button" className="act" onClick={onUndo}>{I.undo()}Undo <kbd>⌘Z</kbd></button>
        <button type="button" className="x" aria-label="Dismiss" onClick={onDismiss}>{I.x()}</button>
        <i className="fuse" aria-hidden onAnimationEnd={e => { e.stopPropagation(); if (e.animationName === "tl-fuse") onExpire(); }} />
      </div>
    );
  }
  if (toast.kind === "gone") {
    return (
      <div className={`tl-del-toast gone${leaving ? " bye" : ""}`} role="status" onAnimationEnd={end}>
        <span className="ic">{I.check()}</span>
        <div className="tx"><b>{toast.title} was already deleted</b><span>Another officer removed it first.</span></div>
        <button type="button" className="x" aria-label="Dismiss" onClick={onDismiss}>{I.x()}</button>
      </div>
    );
  }
  const c = FAIL_COPY[toast.why];
  return (
    <div className={`tl-del-toast fail${c.hard ? " hard" : ""}${leaving ? " bye" : ""}`} role="alert" onAnimationEnd={end}>
      <span className="ic">{c.icon()}</span>
      <div className="tx"><b>{c.title(toast.title)}</b><span>{toast.message ?? c.body}</span></div>
      {toast.why === "signin" && <button type="button" className="act" onClick={onSignIn}>Sign in</button>}
      {(toast.why === "offline" || toast.why === "server") && <button type="button" className="act" onClick={onRetry}>Try again</button>}
      <button type="button" className="x" aria-label="Dismiss" onClick={onDismiss}>{I.x()}</button>
    </div>
  );
}

