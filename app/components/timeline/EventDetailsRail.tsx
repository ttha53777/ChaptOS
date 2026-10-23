"use client";

import React, { useState } from "react";
import {
  DETAIL_KINDS, GUEST_LABEL, applyDetailAction, budgetTotal, collabText, customValueText, isFilled, money, safeHref,
  type DetailAction, type DetailOf, type DetailType, type EventDetail,
} from "@/lib/event-details";
import { roleTitle, type Brother } from "../../data";
import { ApiError, requestJson } from "../../lib/api";
import { BrotherAvatar } from "../BrotherAvatar";
import { DETAIL_ICON, UI_ICON } from "./detail-icons";
import "./event-details.css";

// The timeline rail's half of "More details" (_design/Timeline Rail Details Mock.html).
// The rail keeps its order — hero, Time / Where, links, attendance — and details
// slot in by what the reader is trying to do:
//   • one-line facts (theme, collabs, dress code, who's invited + cap, your own fields) are more
//     rows of the Time / Where list; getting-there folds under Where and the door
//     code stays hidden until tapped;
//   • "Questions on the day" — the contact, one button in the way they prefer;
//   • "Who's bringing what" — the one thing a member is asked to act on;
//   • links as luggage tags;
//   • Planning (checklist, budget) — officers only, folded to a line each.
// A detail nobody filled in shows nothing, so an event without details reads
// exactly as it did before.

const first = <T extends DetailType>(details: EventDetail[], type: T) =>
  details.find((d): d is DetailOf<T> => d.type === type && isFilled(d));

/** "Getting there" under the Where row: the note, and the door code behind a tap. */
export function DirectionsNote({ details }: { details: EventDetail[] }) {
  const dir = first(details, "directions");
  const [shown, setShown] = useState(false);
  if (!dir) return null;
  return (
    <>
      {dir.text.trim() && <div className="evd-howto">{dir.text.trim()}</div>}
      {dir.code.trim() && (
        <div className="evd-code">
          <span>Door code</span>
          <button type="button" className={shown ? "shown" : ""} onClick={() => setShown(s => !s)} aria-label={shown ? "Hide door code" : "Show door code"}>
            {shown ? dir.code.trim() : "••••"}<small>{shown ? "Hide" : "Show"}</small>
          </button>
        </div>
      )}
    </>
  );
}

/** A spine row's hint that the event carries details: up to three icon tiles. */
export function DetailStack({ details }: { details: EventDetail[] }) {
  const kinds = details.filter(isFilled).map(d => d.type);
  if (!kinds.length) return null;
  return (
    <span className="evd-stack" title={`${kinds.length} extra detail${kinds.length > 1 ? "s" : ""}`} aria-hidden="true">
      {kinds.slice(0, 3).map((t, i) => <i key={i} data-hue={DETAIL_KINDS[t].hue}>{DETAIL_ICON[t]}</i>)}
    </span>
  );
}

/** The two or three facts you'd want before even opening the event. */
export function detailChips(details: EventDetail[]): { type: DetailType; text: string }[] {
  const out: { type: DetailType; text: string }[] = [];
  const theme = first(details, "theme"), dress = first(details, "dress"), guests = first(details, "guests"), supplies = first(details, "supplies");
  if (theme) out.push({ type: "theme", text: theme.text.trim() });
  if (dress) out.push({ type: "dress", text: dress.pick === "Theme" && dress.note.trim() ? dress.note.trim() : dress.pick ?? dress.note.trim() });
  if (guests) out.push({ type: "guests", text: guests.mode === "plus" ? `+${guests.plus} guest${guests.plus > 1 ? "s" : ""}` : guests.mode === "invite" ? "Invite-only" : guests.mode === "public" ? "Public" : "Members" });
  if (supplies) {
    const open = supplies.items.filter(i => i.item.trim() && i.who == null).length;
    if (open) out.push({ type: "supplies", text: `${open} to bring` });
  }
  return out.slice(0, 3);
}

/** Up next's chips: the facts above as small paper tags. */
export function DetailChips({ details }: { details: EventDetail[] }) {
  const chips = detailChips(details);
  if (!chips.length) return null;
  return (
    <span className="evd-chips">
      {chips.map(c => <span key={c.type} data-hue={DETAIL_KINDS[c.type].hue}><i>{DETAIL_ICON[c.type]}</i>{c.text}</span>)}
    </span>
  );
}

/** True when the meta list has detail rows to show even with no time or place. */
export function hasDetailFacts(details: EventDetail[]): boolean {
  return details.some(d => isFilled(d) && (d.type === "theme" || d.type === "collabs" || d.type === "dress" || d.type === "guests" || d.type === "capacity" || d.type === "custom" || d.type === "directions"));
}

/** Extra rows for the rail's Time / Where list. */
export function DetailFacts({ details }: { details: EventDetail[] }) {
  const theme = first(details, "theme"), collabs = first(details, "collabs");
  const dress = first(details, "dress"), guests = first(details, "guests"), cap = first(details, "capacity");
  const own = details.filter((d): d is DetailOf<"custom"> => d.type === "custom" && isFilled(d));
  const who = !guests ? "" : guests.mode === "plus" ? `Members + ${guests.plus} guest${guests.plus > 1 ? "s" : ""} each`
    : guests.mode === "invite" ? "Invite-only" : guests.mode === "public" ? "Open to the public" : `${GUEST_LABEL.members.b} only`;
  return (
    <>
      {theme && <div className="ev-meta-row"><span className="lab">Theme</span><b className="evd-b">{theme.text.trim()}</b></div>}
      {collabs && <div className="ev-meta-row"><span className="lab">With</span><span>{collabText(collabs)}</span></div>}
      {dress && (
        <div className="ev-meta-row"><span className="lab">Wear</span>
          <span><b className="evd-b">{dress.pick}</b>{dress.note.trim() && <span className="evd-q"> — {dress.note.trim()}</span>}</span>
        </div>
      )}
      {(guests || cap) && (
        <div className="ev-meta-row"><span className="lab">Who</span>
          <span>
            {who && <b className="evd-b">{who}</b>}
            {cap && <span className={who ? "evd-s" : ""}>Up to {cap.cap.toLocaleString()} people</span>}
          </span>
        </div>
      )}
      {own.map(d => (
        <div key={d.id} className="ev-meta-row evd-own">
          <b className="evd-b">{d.label.trim()}</b>
          {d.kind === "yesno"
            ? <span className={`evd-yes ${d.value ? "y" : "n"}`}>{d.value ? "Yes" : "No"}</span>
            : <span className="evd-q"> {customValueText(d)}</span>}
        </div>
      ))}
    </>
  );
}

/**
 * Contact, sign-up sheet, links and (officers) planning. Owns the two in-place
 * writes: claiming a supply and ticking the checklist, applied optimistically
 * with the same rule the server enforces, then replaced by the server's answer.
 */
export function DetailSections({ eventId, details, canManage, selfId, brothers, onChange, onOpenMember }: {
  eventId: number;
  details: EventDetail[];
  canManage: boolean;
  selfId: number | null;
  brothers: Pick<Brother, "id" | "name" | "avatarUrl" | "role" | "roles">[];
  onChange: (details: EventDetail[]) => void;
  onOpenMember: (brotherId: number) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const contact = first(details, "contact");
  const supplies = first(details, "supplies");
  const links = first(details, "links");
  const checklist = canManage ? first(details, "checklist") : undefined;
  const budget = canManage ? first(details, "budget") : undefined;
  const byId = (id: number | null) => (id == null ? undefined : brothers.find(b => b.id === id));
  const firstName = (id: number | null) => byId(id)?.name.split(" ")[0] ?? "Someone";

  async function act(action: DetailAction) {
    const local = applyDetailAction(details, action, { brotherId: selfId, isOfficer: canManage });
    if (!local.ok) { setErr(local.message); return; }
    const before = details;
    setErr(null);
    setBusy(action.itemId);
    onChange(local.details);
    try {
      const res = await requestJson<{ details: EventDetail[] }>(`/api/calendar/${eventId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      onChange(res.details);
    } catch (e) {
      onChange(before);
      const msg = e instanceof ApiError ? (e.body as { error?: unknown } | null)?.error : null;
      setErr(typeof msg === "string" ? msg : "That didn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const reach = contact && contactAction(contact, firstName(contact.who));
  const linkItems = links?.items.filter(i => safeHref(i.url)) ?? [];
  const supplyItems = supplies?.items.filter(i => i.item.trim()) ?? [];
  const openCount = supplyItems.filter(i => i.who == null).length;

  return (
    <>
      {contact && contact.who != null && byId(contact.who) && (
        <div className="evd-sec">
          <h5>Questions on the day</h5>
          <div className="evd-who">
            <button type="button" className="ava" onClick={() => onOpenMember(contact.who!)} aria-label={`Open ${byId(contact.who)!.name}`}>
              <BrotherAvatar brother={byId(contact.who)!} size="sm" />
            </button>
            <span className="nm">
              <b>{byId(contact.who)!.name}</b>
              <small>{roleTitle(byId(contact.who)!) || "Member"}</small>
            </span>
            {reach
              ? <a className="evd-btn" href={reach.href}>{contact.prefer === "call" ? UI_ICON.phone : UI_ICON.msg}{reach.label}</a>
              : <button type="button" className="evd-btn ghost" onClick={() => onOpenMember(contact.who!)}>View card</button>}
          </div>
        </div>
      )}

      {supplies && supplyItems.length > 0 && (
        <div className="evd-sec">
          <h5>
            Who’s bringing what <span className="n">{supplyItems.length - openCount} of {supplyItems.length}</span>
            {openCount > 0 && <span className="flag">{openCount} still needed</span>}
          </h5>
          <div className="evd-bring">
            {supplyItems.map(it => {
              const mine = it.who != null && it.who === selfId;
              const who = byId(it.who);
              return (
                <div key={it.id} className={`ln${mine ? " mine" : it.who == null ? " open" : ""}`}>
                  <span className="it" title={it.item}>{it.item}</span>
                  {mine ? (
                    <span className="by">{UI_ICON.tick}You’re bringing it
                      <button type="button" className="undo" disabled={busy === it.id} onClick={() => act({ op: "claim", detailId: supplies.id, itemId: it.id, claim: false })}>undo</button>
                    </span>
                  ) : it.who != null ? (
                    <span className="by">
                      {who && <BrotherAvatar brother={who} size="xs" />}
                      {firstName(it.who)}
                      {canManage && <button type="button" className="undo" disabled={busy === it.id} onClick={() => act({ op: "claim", detailId: supplies.id, itemId: it.id, claim: false })} aria-label={`Clear ${firstName(it.who)}'s claim`}>clear</button>}
                    </span>
                  ) : selfId != null ? (
                    <button type="button" className="evd-btn" disabled={busy === it.id} onClick={() => act({ op: "claim", detailId: supplies.id, itemId: it.id, claim: true })}>
                      {UI_ICON.hand}I’ll bring it
                    </button>
                  ) : <span className="open-tag">Unclaimed</span>}
                </div>
              );
            })}
          </div>
          {err && <p className="evd-err" role="alert">{err}</p>}
        </div>
      )}

      {linkItems.length > 0 && (
        <div className="evd-sec">
          <h5>Links</h5>
          <div className="evd-tags">
            {linkItems.map(l => (
              <a key={l.id} className="evd-lt" href={safeHref(l.url)!} target="_blank" rel="noopener noreferrer">
                {l.label.trim() || hostOf(l.url)}{UI_ICON.ext}
              </a>
            ))}
          </div>
        </div>
      )}

      {(checklist || budget) && (
        <div className="evd-sec">
          <h5>Planning <span className="lock">{UI_ICON.lock}Officers only</span></h5>
          {checklist && (() => {
            const done = checklist.items.filter(i => i.done).length, isOpen = !!open.ck;
            return (
              <div className={`evd-fold${isOpen ? " open" : ""}`}>
                <button type="button" className="evd-fold-h" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, ck: !o.ck }))}>
                  <span className="ti" data-hue="mint">{DETAIL_ICON.checklist}</span>
                  <span className="t">Checklist</span>
                  <span className="mini-prog"><i style={{ width: `${(done / checklist.items.length) * 100}%` }} /></span>
                  <span className="s">{done}/{checklist.items.length}</span>
                  <span className="chev">{UI_ICON.chev}</span>
                </button>
                {isOpen && (
                  <div className="evd-fold-b evd-todo">
                    {checklist.items.map(it => (
                      <label key={it.id}>
                        <input type="checkbox" checked={it.done} disabled={busy === it.id} onChange={e => act({ op: "tick", detailId: checklist.id, itemId: it.id, done: e.target.checked })} />
                        <span className="bx">{UI_ICON.tick}</span>
                        <span>{it.t}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {budget && (() => {
            const isOpen = !!open.bg, total = budgetTotal(budget);
            return (
              <div className={`evd-fold${isOpen ? " open" : ""}`}>
                <button type="button" className="evd-fold-h" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, bg: !o.bg }))}>
                  <span className="ti" data-hue="butter">{DETAIL_ICON.budget}</span>
                  <span className="t">Budget</span>
                  <span className="s">{money(total)} planned</span>
                  <span className="chev">{UI_ICON.chev}</span>
                </button>
                {isOpen && (
                  <div className="evd-fold-b">
                    <div className="evd-rcpt">
                      {budget.items.map(i => (
                        <div key={i.id} className="r"><span className="l">{i.label || "Item"}</span><span className="dots" /><span>{money(i.amt ?? 0)}</span></div>
                      ))}
                      <div className="tot"><span>TOTAL</span><span>{money(total)}</span></div>
                    </div>
                    <p className="evd-note">A plan, not a payment — nothing posts to Treasury.</p>
                  </div>
                )}
              </div>
            );
          })()}
          {!supplies && err && <p className="evd-err" role="alert">{err}</p>}
        </div>
      )}
    </>
  );
}

function hostOf(url: string): string {
  try { return new URL(safeHref(url)!).hostname.replace(/^www\./, ""); } catch { return url; }
}
/** sms:/tel: for the contact's preferred channel; null without a usable number. */
function contactAction(c: DetailOf<"contact">, name: string): { href: string; label: string } | null {
  const digits = c.phone.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 7) return null;
  return c.prefer === "call" ? { href: `tel:${digits}`, label: `Call ${name}` } : { href: `sms:${digits}`, label: `Text ${name}` };
}
