"use client";

/**
 * The Service page under the Paper aesthetic — _design/Dashboard Paper Mock.html
 * #service. page.tsx owns all state and handlers; every class here is psv-
 * namespaced.
 *
 * Events split into Coming up / Logged; each row leads with a desk-calendar date
 * and opens onto its sign-in sheet. Members are punch cards: one hole per hour of
 * the goal, punched as hours land.
 */

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { BrotherAvatar } from "../../../components/BrotherAvatar";
import { LoadingSpinner } from "../../../components/dashboard/primitives";
import { PaperIcon, type PaperIconName } from "../../../components/paper/PaperIcon";
import { roleTitle, type Brother } from "../../../data";
import type { Schedule } from "@/lib/calendar-feed/schedule";
import {
  DAY_ONE, MEASURES, PAGE, avgHours, cardTail, dateParts, dayLabel, dayOneHoles, digestEmpty, digestRest, dow3, eventTag,
  holesFor, ledgerStats, lineNo, members, mon3, nextWhen, r1, rankMembers, sheetEmpty, sheetRows, sheetSum, splitEvents,
  standing, timeLabel, todayOf,
} from "@/lib/service/ledger";

export interface PsvEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  notes: string;
  createdAt: string;
  schedule?: Schedule | null;
  time?: string | null;
  /** Stable across the swap from a temporary id to the saved one. */
  clientKey?: string;
  /** Added here but not saved yet: shown, but nothing can open or act on it. */
  pending?: boolean;
}

export interface PsvParticipation {
  id: number;
  serviceEventId: number;
  brotherId: number;
  hours: number;
  brother: { id: number; name: string; avatarUrl: string | null };
}

export { r1, dayLabel, relWhen, timeLabel, standing } from "@/lib/service/ledger";

export function localToday(): string {
  return todayOf(new Date());
}

export function DeskDate({ date, up }: { date: string; up?: boolean }) {
  const p = dateParts(date);
  return (
    <span className={`psv-cal${up ? " up" : ""}`} aria-hidden>
      <small>{mon3(p.m)}</small>
      <b>{p.d}</b>
    </span>
  );
}

/** What an edit can change — a differing signature means the card was re-inked. */
function sig(e: PsvEvent): string {
  return JSON.stringify([e.title, e.date, e.location, e.notes, e.time ?? null, e.schedule ?? null]);
}

/** A card's identity for keys and motion: an added card keeps its client key
 *  once saved, so getting its real id isn't a second arrival. */
function rowKey(e: PsvEvent): string {
  return e.clientKey ?? String(e.id);
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** One-shot CSS animation class; a timer rather than animationend, which children bubble. */
function flashClass(el: HTMLElement, cls: string, ms: number) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}

type Avatarish = { id: number; name: string; avatarUrl?: string | null };
export type AvatarFn = (b: Avatarish, size?: "xs" | "sm" | "md") => ReactNode;

/** Day one (no service events yet) — the Fundraisers day-one pattern: one line of
 *  what this page does, then the three steps as the objects themselves. */
function DayOne({ semesterLabel, goal, canService, onNew }: { semesterLabel: string | null; goal: number; canService: boolean; onNew: () => void }) {
  const { punched, holes } = dayOneHoles(goal);
  return (
    <div className="psv-page">
      <section className="psv-brief">
        <div>
          <p className="psv-kick">{DAY_ONE.kicker}{semesterLabel && <span className="chip">{semesterLabel}</span>}</p>
          <h1 className="psv-greet">{DAY_ONE.greet}<span className="hi">{DAY_ONE.greetHi}</span></h1>
          <p className="psv-digest"><span>{DAY_ONE.digest}</span></p>
        </div>
        {canService && <div className="psv-acts-top"><button className="psv-btn" onClick={onNew}><PaperIcon name="plus" />{PAGE.newEvent}</button></div>}
      </section>

      <section className="psv-d1" aria-label={DAY_ONE.aria}>
        <figure>
          <div><span className="psv-d1-cal" aria-hidden><small>{DAY_ONE.calMonth}</small><b>{DAY_ONE.calDay}</b><span>{DAY_ONE.calTitle}</span></span></div>
          <figcaption><b>{DAY_ONE.steps[0].title}</b><span>{DAY_ONE.steps[0].line}</span></figcaption>
        </figure>
        <figure>
          <div><span className="psv-d1-pad" aria-hidden>
            {DAY_ONE.pad.map(([n, h]) => <span key={n}><i>{n}</i><i>{h}</i></span>)}
          </span></div>
          <figcaption><b>{DAY_ONE.steps[1].title}</b><span>{DAY_ONE.steps[1].line}</span></figcaption>
        </figure>
        <figure>
          <div><span className="psv-d1-punch" aria-hidden>
            <span className="plus">+{punched}h</span><small>{DAY_ONE.card}</small>
            <span className="h">{Array.from({ length: holes }, (_, i) => <i key={i} className={i < punched ? "p" : ""} />)}</span>
          </span></div>
          <figcaption><b>{DAY_ONE.steps[2].title}</b><span>{DAY_ONE.steps[2].line(goal)}</span></figcaption>
        </figure>
      </section>

      {canService
        ? <div className="psv-d1-cta"><button className="psv-btn" onClick={onNew}><PaperIcon name="plus" />{DAY_ONE.cta}</button></div>
        : <p className="psv-d1-note">{DAY_ONE.member}</p>}
    </div>
  );
}

export function PaperService(props: {
  orgName: string;
  semesterLabel: string | null;
  goal: number;
  roster: Brother[];
  events: PsvEvent[];
  eventsLoading: boolean;
  rosterLoading: boolean;
  selfId: number | null;
  canService: boolean;
  view: "events" | "members";
  setView: (v: "events" | "members") => void;
  search: string;
  setSearch: (q: string) => void;
  expandedId: number | null;
  toggleExpand: (id: number) => void;
  partByEvent: Record<number, PsvParticipation[]>;
  avatar: AvatarFn;
  onNew: () => void;
  onLogMine: () => void;
  onLog: (ev: PsvEvent) => void;
  onEdit: (ev: PsvEvent) => void;
  onDelete: (ev: PsvEvent) => void;
  onRemove: (eventId: number, p: PsvParticipation) => void;
  onMember: (b: Brother) => void;
}) {
  const { roster, events, goal, view, search, partByEvent, canService, selfId } = props;
  const today = localToday();

  // Card motion. Every commit records where each card and section header sits
  // (relative to the page, so scrolling doesn't count); when the events list itself
  // changes, new cards drop in, edited ones re-ink, and everything that shifted
  // glides from where it was (FLIP). Expanding a card or searching only re-records —
  // those changes stay instant. Keys: "e<id>" for cards, "s:<section>" for headers.
  const pageRef = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  // Signature by rowKey; null while pending, so the saved copy (whose schedule
  // comes back key-reordered from jsonb) isn't mistaken for an edit.
  const seen = useRef<{ arr: PsvEvent[]; byKey: Map<string, string | null> } | null>(null);
  const track = (key: string) => (el: HTMLElement | null) => { if (el) els.current.set(key, el); else els.current.delete(key); };

  function measure() {
    const top0 = pageRef.current?.getBoundingClientRect().top ?? 0;
    const m = new Map<string, number>();
    els.current.forEach((el, k) => m.set(k, el.getBoundingClientRect().top - top0));
    return m;
  }

  useLayoutEffect(() => {
    const now = measure();
    const s = seen.current;
    if (!props.eventsLoading && s && s.arr !== events && !reducedMotion()) {
      const evByKey = new Map(events.map(e => [rowKey(e), e]));
      els.current.forEach((el, key) => {
        const from = tops.current.get(key), to = now.get(key);
        const ev = key[0] === "e" ? evByKey.get(key.slice(1)) : undefined;
        if (ev && !s.byKey.has(rowKey(ev))) {
          flashClass(el, "psv-in", 1600);
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          return;
        }
        if (from === undefined) {
          // A section header that just appeared.
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120, easing: "ease-out", fill: "backwards" });
        } else if (to !== undefined && Math.abs(from - to) > 1) {
          // Longer trips take a little longer, so nothing whips across the page.
          el.animate([{ transform: `translateY(${from - to}px)` }, { transform: "none" }],
            { duration: Math.min(620, 340 + Math.abs(from - to) * 0.7), easing: "cubic-bezier(.3,.7,.25,1)" });
        }
        const was = ev && s.byKey.get(rowKey(ev));
        if (ev && was != null && was !== sig(ev)) {
          flashClass(el, "psv-reink", 1400);
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      });
    }
    tops.current = now;
    if (!props.eventsLoading) seen.current = { arr: events, byKey: new Map(events.map(e => [rowKey(e), e.pending ? null : sig(e)])) };
  });

  /** Slide the card off the desk and close its gap — taking its section header
   *  along when it was the last card under it — then hand it to the page's
   *  (optimistic) delete. Positions are re-recorded first, so the FLIP after the
   *  delete starts from the collapsed layout instead of replaying the collapse. */
  function remove(ev: PsvEvent) {
    const el = els.current.get(`e${rowKey(ev)}`);
    if (!el || reducedMotion()) { props.onDelete(ev); return; }
    if (el.dataset.leaving) return;
    el.dataset.leaving = "1";
    const sec = el.parentElement?.childElementCount === 1 && el.parentElement.previousElementSibling?.classList.contains("psv-sec")
      ? el.parentElement.previousElementSibling as HTMLElement : null;
    const timing: KeyframeAnimationOptions = { duration: 500, fill: "forwards" };
    const off = "translateX(36px) rotate(1.5deg)";
    const box = (n: HTMLElement) => {
      const cs = getComputedStyle(n);
      return { height: `${n.offsetHeight}px`, marginTop: cs.marginTop, marginBottom: cs.marginBottom, borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth };
    };
    const shut = { height: "0px", marginTop: "0px", marginBottom: "0px", borderTopWidth: "0px", borderBottomWidth: "0px" };
    for (const n of [el, sec]) if (n) { n.style.overflow = "hidden"; n.style.pointerEvents = "none"; }
    // Lift away (ease-in), then close the gap (ease-in-out).
    const b = box(el);
    const a = el.animate([
      { ...b, opacity: 1, transform: "none", easing: "cubic-bezier(.5,0,.75,0)" },
      { ...b, opacity: 0, transform: off, offset: 0.4, easing: "cubic-bezier(.45,0,.2,1)" },
      { ...shut, opacity: 0, transform: off },
    ], timing);
    if (sec) {
      const sb = box(sec);
      sec.animate([
        { ...sb, opacity: 1, easing: "linear" },
        { ...sb, opacity: 0, offset: 0.4, easing: "cubic-bezier(.45,0,.2,1)" },
        { ...shut, opacity: 0 },
      ], timing);
    }
    a.onfinish = () => { tops.current = measure(); props.onDelete(ev); };
  }


  const stats = ledgerStats(roster, events, goal, today);
  const { total, onTrack, next, hasEvents, hasPast } = stats;
  const { matched: evF, up, past } = splitEvents(events, search, today);
  const rosF = rankMembers(roster, search);

  const todayP = dateParts(today);
  const ask = () => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: PAGE.askQ } }));


  function eventCard(ev: PsvEvent) {
    const tag = eventTag(ev.date, today);
    const isUp = tag.up;
    const open = props.expandedId === ev.id;
    const s = sheetSum(partByEvent[ev.id]);
    const t = timeLabel(ev);
    const rows = sheetRows(partByEvent[ev.id]);
    return (
      <div key={rowKey(ev)} ref={track(`e${rowKey(ev)}`)}
        className={`psv-ev${isUp ? " up" : ""}${open ? " open" : ""}${ev.pending ? " pending" : ""}`} aria-busy={ev.pending || undefined}>
        <button className="psv-head" onClick={() => props.toggleExpand(ev.id)} aria-expanded={open} disabled={ev.pending}>
          <DeskDate date={ev.date} up={isUp} />
          <span className="psv-main">
            <span className="t">
              {ev.title}
              <span className={`psv-tag${isUp ? " up" : ""}`}>{tag.label}</span>
            </span>
            <span className="m">
              <span><PaperIcon name="cal" />{dayLabel(ev.date)}{t ? ` · ${t}` : ""}</span>
              {ev.location && <span><PaperIcon name="pin" />{ev.location}</span>}
            </span>
          </span>
          <span className="psv-stats">
            <span className={s?.n ? "" : "none"}><b>{s?.n || "—"}</b> {PAGE.here}</span>
            <span className={s?.n ? "" : "none"}><b>{s?.n ? r1(s.h) : "—"}</b> {PAGE.hours}</span>
          </span>
          <PaperIcon name="chev-r" className="pp-ic chev" />
        </button>
        {open && (
          <div className="psv-body">
            {ev.notes && <p className="psv-notes">{ev.notes}</p>}
            <div className="psv-sheet">
              <div className="psv-sh-h"><span>#</span><span className="who-h">{PAGE.signedIn}</span><span className="r">{PAGE.hoursCol}</span><span /></div>
              {partByEvent[ev.id] === undefined ? (
                <p className="empty">{PAGE.fetching}</p>
              ) : rows.length === 0 ? (
                <p className="empty">{sheetEmpty(isUp, canService)}</p>
              ) : (
                <>
                  {rows.map((p, i) => (
                    <div className="psv-line" key={p.id}>
                      <span className="no">{lineNo(i)}</span>
                      <span className="who">
                        {props.avatar(p.brother, "xs")}
                        <b>{p.brother.name}{p.brotherId === selfId && <span className="you">{PAGE.you}</span>}</b>
                      </span>
                      <span className="h">{r1(p.hours)}h</span>
                      {canService ? (
                        <button className="psv-ib" onClick={() => props.onRemove(ev.id, p)} aria-label={`Remove ${p.brother.name}`} title={PAGE.remove}>
                          <PaperIcon name="plus" className="pp-ic x45" />
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                  <div className="tot">
                    <span /><span>{members(rows.length)}</span>
                    <b>{r1(rows.reduce((a, p) => a + p.hours, 0))}h</b><span />
                  </div>
                </>
              )}
            </div>
            {canService && (
              <div className="psv-acts">
                <button className="psv-btn sm" onClick={() => props.onLog(ev)}><PaperIcon name="clock" />{PAGE.logHours}</button>
                <button className="psv-btn sm soft" onClick={() => props.onEdit(ev)}><PaperIcon name="pencil" />{PAGE.edit}</button>
                <button className="psv-btn sm soft del" onClick={() => remove(ev)}><PaperIcon name="trash" />{PAGE.delete}</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const meas = (label: string, icon: PaperIconName, tone: string, v: ReactNode, note: string, warn?: boolean) => (
    <div className="psv-meas" style={{ ["--c" as string]: `var(--pp-${tone}-ink)` }} key={label}>
      <p className="l"><PaperIcon name={icon} />{label}</p>
      <p className={`v${warn ? " warn" : ""}`}>{v}</p>
      <p className="d">{note}</p>
    </div>
  );
  const unset = (label: string, icon: PaperIconName, tone: string, why: string) => (
    <div className="psv-meas unset" style={{ ["--c" as string]: `var(--pp-${tone}-ink)` }} key={label}>
      <p className="l"><PaperIcon name={icon} />{label}</p>
      <p className="v">—</p>
      <p className="why">{why}</p>
    </div>
  );

  if (!props.eventsLoading && !hasEvents) {
    // Wait for the chapter (and so canService) before choosing officer vs member copy.
    if (props.rosterLoading) return <div className="psv-page"><div className="psv-loading"><LoadingSpinner size="md" tone="dusk" label="Loading service" /></div></div>;
    return <DayOne semesterLabel={props.semesterLabel} goal={goal} canService={canService} onNew={props.onNew} />;
  }

  return (
    <div className="psv-page" ref={pageRef}>
      <section className="psv-brief">
        <div>
          <p className="psv-kick">
            <span className="chip">{dow3(todayP.dow)} · {mon3(todayP.m)} {todayP.d}</span>
            {PAGE.kicker}{props.semesterLabel ? ` · ${props.semesterLabel}` : ""}
          </p>
          <h1 className="psv-greet">{PAGE.greet}<span className="hi">{PAGE.greetHi}</span></h1>
          {!props.eventsLoading && !props.rosterLoading && <p className="psv-digest">
            {hasEvents && <span className="aichip"><PaperIcon name="spark" />{PAGE.digest}</span>}
            <span>
              {roster.length === 0 || !hasEvents ? digestEmpty(props.orgName, roster.length)
                : <>
                    <b>{r1(total)} hours</b>{digestRest(stats, events.length, goal)}
                    {next && <>{PAGE.nextUp}<b>{next.title}</b>, {nextWhen(next.date, today)}.</>}
                  </>}
            </span>
          </p>}
        </div>
        <div className="psv-acts-top">
          {props.canService && <button className="psv-btn" onClick={props.onNew}><PaperIcon name="plus" />{PAGE.newEvent}</button>}
          <button className="psv-btn ghost" onClick={props.onLogMine} disabled={!hasPast} title={hasPast ? undefined : PAGE.logMineNone}>
            <PaperIcon name="clock" />{PAGE.logMine}
          </button>
          <button className="psv-askbar" onClick={ask}><PaperIcon name="spark" />{PAGE.ask}<kbd>⌘K</kbd></button>
        </div>
      </section>

      <section className="psv-meas-row">
        {!hasEvents ? [
          unset(MEASURES.hours.label, MEASURES.hours.icon, MEASURES.hours.tone, MEASURES.hours.why),
          unset(MEASURES.events.label, MEASURES.events.icon, MEASURES.events.tone, MEASURES.events.why),
          unset(MEASURES.onTrack.label, MEASURES.onTrack.icon, MEASURES.onTrack.tone, MEASURES.onTrack.why(goal)),
          unset(MEASURES.avg.label, MEASURES.avg.icon, MEASURES.avg.tone, MEASURES.avg.why),
        ] : [
          meas(MEASURES.hours.label, MEASURES.hours.icon, MEASURES.hours.tone, <>{r1(total)}<small>h</small></>, MEASURES.hours.note),
          meas(MEASURES.events.label, MEASURES.events.icon, MEASURES.events.tone, events.length, MEASURES.events.note(stats.upcoming)),
          meas(MEASURES.onTrack.label, MEASURES.onTrack.icon, MEASURES.onTrack.tone, <>{onTrack}<small>/{roster.length}</small></>, MEASURES.onTrack.note(goal), roster.length > 0 && onTrack < roster.length),
          meas(MEASURES.avg.label, MEASURES.avg.icon, MEASURES.avg.tone, <>{r1(avgHours(total, roster.length))}<small>h</small></>, MEASURES.avg.note),
        ]}
      </section>

      <div className="psv-tools">
        <label className="psv-search">
          <PaperIcon name="search" />
          <input type="search" value={search} onChange={e => props.setSearch(e.target.value)}
            placeholder={view === "events" ? PAGE.searchEvents : PAGE.searchMembers} aria-label="Search" autoComplete="off" />
        </label>
        <div className="psv-tabs" role="tablist" aria-label="View">
          {(["events", "members"] as const).map(k => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => props.setView(k)}>{k === "events" ? PAGE.events : PAGE.members}</button>
          ))}
        </div>
        <span className="psv-scope">{view === "events" ? `${evF.length} of ${events.length}` : `${rosF.length} of ${roster.length}`}</span>
      </div>

      {view === "events" ? (
        props.eventsLoading ? (
          <div className="psv-loading"><LoadingSpinner size="md" tone="dusk" label="Loading events" /></div>
        ) : !hasEvents ? (
          <div className="psv-empty">
            <span className="art"><PaperIcon name="heart" /></span>
            <h3>{PAGE.emptyTitle}</h3>
            <p>{props.canService ? PAGE.emptyOfficer : PAGE.emptyMember}</p>
            {props.canService && <div className="actions"><button className="psv-btn" onClick={props.onNew}><PaperIcon name="plus" />{PAGE.newEvent}</button></div>}
          </div>
        ) : evF.length === 0 ? (
          <div className="psv-calm">
            <span className="art"><PaperIcon name="search" /></span>
            <div><h4>{PAGE.noMatch}</h4><p>{PAGE.noMatchLine}</p>
              <button className="psv-btn sm ghost" onClick={() => props.setSearch("")}>{PAGE.clear}</button></div>
          </div>
        ) : (
          <>
            {up.length > 0 && <>
              <div className="psv-sec" ref={track("s:up")}><h2>{PAGE.comingUp}</h2><span className="rule" /><span className="cnt">{up.length}</span></div>
              <div>{up.map(eventCard)}</div>
            </>}
            {past.length > 0 && <>
              <div className="psv-sec" ref={track("s:past")}><h2>{PAGE.logged}</h2><span className="rule" /><span className="cnt">{past.length} · {PAGE.newestFirst}</span></div>
              <div>{past.map(eventCard)}</div>
            </>}
          </>
        )
      ) : props.rosterLoading ? (
        <div className="psv-loading"><LoadingSpinner size="md" tone="dusk" label="Loading members" /></div>
      ) : rosF.length === 0 ? (
        <div className="psv-calm">
          <span className="art"><PaperIcon name="search" /></span>
          <div><h4>{PAGE.noMembers}</h4><p>{PAGE.noMembersLine}</p></div>
        </div>
      ) : (
        <>
          <div className="psv-legend">
            <span style={{ ["--c" as string]: "var(--pp-mint)" }}><i />{PAGE.legendOk(goal)}</span>
            <span style={{ ["--c" as string]: "var(--pp-butter)" }}><i />{PAGE.legendHalf}</span>
            <span style={{ ["--c" as string]: "var(--pp-peach)" }}><i />{PAGE.legendUnder}</span>
            <span>{PAGE.legendNote}</span>
          </div>
          <div className="psv-cards">
            {rosF.map(b => {
              const hh = b.serviceHours;
              const st = standing(hh, goal);
              const you = b.id === selfId;
              const holes = holesFor(goal);
              const tail = cardTail(hh, goal);
              return (
                <button key={b.id} className={`psv-card ${st}${you ? " you" : ""}`} onClick={() => props.onMember(b)}>
                  {props.avatar(b, "sm")}
                  <span className="nm">{b.name}<small>{roleTitle(b) || PAGE.member}{you ? PAGE.you : ""}</small></span>
                  <span className="hr">{r1(hh)}<i>/{goal}h</i></span>
                  <span className="psv-holes">
                    {Array.from({ length: holes }, (_, i) => <i key={i} className={i < Math.floor(hh) ? "p" : ""} />)}
                    <span className={tail.kind}>{tail.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
