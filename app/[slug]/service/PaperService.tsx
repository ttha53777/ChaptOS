"use client";

/**
 * The Service page under the Paper aesthetic — _design/Dashboard Paper Mock.html
 * #service. Rendered in .pp-only beside the Ledger body (page.tsx owns all state
 * and handlers), so every class here is psv- namespaced and Ledger never sees it.
 *
 * Events split into Coming up / Logged; each row leads with a desk-calendar date
 * and opens onto its sign-in sheet. Members are punch cards: one hole per hour of
 * the goal, punched as hours land.
 */

import type { ReactNode } from "react";
import { BrotherAvatar } from "../../components/BrotherAvatar";
import { LoadingSpinner } from "../../components/dashboard/primitives";
import { PaperIcon, type PaperIconName } from "../../components/paper/PaperIcon";
import { roleTitle, type Brother } from "../../data";
import type { Schedule } from "@/lib/calendar-feed/schedule";

export interface PsvEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  notes: string;
  createdAt: string;
  schedule?: Schedule | null;
  time?: string | null;
}

export interface PsvParticipation {
  id: number;
  serviceEventId: number;
  brotherId: number;
  hours: number;
  brother: { id: number; name: string; avatarUrl: string | null };
}

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function r1(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

/** "Sat, Oct 17" */
export function dayLabel(date: string): string {
  const p = parts(date);
  return `${DOW3[p.dow]}, ${MON3[p.m - 1]} ${p.d}`;
}

function daysFrom(date: string, today: string): number {
  const a = parts(date), b = parts(today);
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
}

export function relWhen(date: string, today: string): string {
  const n = daysFrom(date, today);
  if (n <= 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `In ${n} days`;
}

function clock(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

/** "10:00 AM–1:00 PM", the legacy free text, or null for all-day. */
export function timeLabel(ev: PsvEvent): string | null {
  const s = ev.schedule;
  if (s?.kind === "timed") return clock(s.start, s.timeZone) + (s.end ? `–${clock(s.end, s.timeZone)}` : "");
  if (s?.kind === "allDay") return null;
  return ev.time?.trim() || null;
}

export function standing(h: number, goal: number): "ok" | "watch" | "risk" {
  return h >= goal ? "ok" : h >= goal / 2 ? "watch" : "risk";
}

export function DeskDate({ date, up }: { date: string; up?: boolean }) {
  const p = parts(date);
  return (
    <span className={`psv-cal${up ? " up" : ""}`} aria-hidden>
      <small>{MON3[p.m - 1]}</small>
      <b>{p.d}</b>
    </span>
  );
}

type Avatarish = { id: number; name: string; avatarUrl?: string | null };
export type AvatarFn = (b: Avatarish, size?: "xs" | "sm" | "md") => ReactNode;

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
  const q = search.trim().toLowerCase();

  const total = roster.reduce((s, b) => s + b.serviceHours, 0);
  const onTrack = roster.filter(b => b.serviceHours >= goal).length;
  const behind = roster.length - onTrack;
  const upcomingAll = events.filter(e => e.date >= today);
  const next = [...upcomingAll].sort((a, b) => a.date.localeCompare(b.date))[0];
  const hasEvents = events.length > 0;
  const hasPast = events.some(e => e.date <= today);

  const evF = events.filter(e => !q || e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q));
  const up = evF.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = evF.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const rosF = roster
    .filter(b => !q || b.name.toLowerCase().includes(q))
    .sort((a, b) => b.serviceHours - a.serviceHours || a.name.localeCompare(b.name));

  const todayP = parts(today);
  const ask = () => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: "Who's behind on service hours?" } }));

  function sum(id: number) {
    const rows = partByEvent[id];
    return rows ? { n: rows.length, h: rows.reduce((s, p) => s + p.hours, 0) } : null;
  }

  function eventCard(ev: PsvEvent) {
    const isUp = ev.date >= today;
    const open = props.expandedId === ev.id;
    const s = sum(ev.id);
    const t = timeLabel(ev);
    const rows = [...(partByEvent[ev.id] ?? [])].sort((a, b) => a.brother.name.localeCompare(b.brother.name));
    return (
      <div key={ev.id} className={`psv-ev${isUp ? " up" : ""}${open ? " open" : ""}`}>
        <button className="psv-head" onClick={() => props.toggleExpand(ev.id)} aria-expanded={open}>
          <DeskDate date={ev.date} up={isUp} />
          <span className="psv-main">
            <span className="t">
              {ev.title}
              {isUp
                ? <span className="psv-tag up">{daysFrom(ev.date, today) <= 7 ? relWhen(ev.date, today) : "Coming up"}</span>
                : <span className="psv-tag">Past</span>}
            </span>
            <span className="m">
              <span><PaperIcon name="cal" />{dayLabel(ev.date)}{t ? ` · ${t}` : ""}</span>
              {ev.location && <span><PaperIcon name="pin" />{ev.location}</span>}
            </span>
          </span>
          <span className="psv-stats">
            <span className={s?.n ? "" : "none"}><b>{s?.n || "—"}</b> here</span>
            <span className={s?.n ? "" : "none"}><b>{s?.n ? r1(s.h) : "—"}</b> hours</span>
          </span>
          <PaperIcon name="chev-r" className="pp-ic chev" />
        </button>
        {open && (
          <div className="psv-body">
            {ev.notes && <p className="psv-notes">{ev.notes}</p>}
            <div className="psv-sheet">
              <div className="psv-sh-h"><span>#</span><span className="who-h">Signed in</span><span className="r">Hours</span><span /></div>
              {partByEvent[ev.id] === undefined ? (
                <p className="empty">Fetching the sheet…</p>
              ) : rows.length === 0 ? (
                <p className="empty">{isUp ? "Nobody’s logged yet — hours go in after the event." : canService ? "No one logged yet. Use “Log hours” to record attendees." : "No one logged yet."}</p>
              ) : (
                <>
                  {rows.map((p, i) => (
                    <div className="psv-line" key={p.id}>
                      <span className="no">{String(i + 1).padStart(2, "0")}</span>
                      <span className="who">
                        {props.avatar(p.brother, "xs")}
                        <b>{p.brother.name}{p.brotherId === selfId && <span className="you"> · you</span>}</b>
                      </span>
                      <span className="h">{r1(p.hours)}h</span>
                      {canService ? (
                        <button className="psv-ib" onClick={() => props.onRemove(ev.id, p)} aria-label={`Remove ${p.brother.name}`} title="Remove">
                          <PaperIcon name="plus" className="pp-ic x45" />
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                  <div className="tot">
                    <span /><span>{rows.length} {rows.length === 1 ? "member" : "members"}</span>
                    <b>{r1(rows.reduce((a, p) => a + p.hours, 0))}h</b><span />
                  </div>
                </>
              )}
            </div>
            {canService && (
              <div className="psv-acts">
                <button className="psv-btn sm" onClick={() => props.onLog(ev)}><PaperIcon name="clock" />Log hours</button>
                <button className="psv-btn sm soft" onClick={() => props.onEdit(ev)}><PaperIcon name="pencil" />Edit</button>
                <button className="psv-btn sm soft del" onClick={() => props.onDelete(ev)}><PaperIcon name="trash" />Delete</button>
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

  return (
    <div className="psv-page">
      <section className="psv-brief">
        <div>
          <p className="psv-kick">
            <span className="chip">{DOW3[todayP.dow]} · {MON3[todayP.m - 1]} {todayP.d}</span>
            The service log{props.semesterLabel ? ` · ${props.semesterLabel}` : ""}
          </p>
          <h1 className="psv-greet">Hours, <span className="hi">by the event.</span></h1>
          {!props.eventsLoading && !props.rosterLoading && <p className="psv-digest">
            {hasEvents && <span className="aichip"><PaperIcon name="spark" />Digest</span>}
            <span>
              {roster.length === 0 ? `${props.orgName} hasn't added members yet.`
                : !hasEvents ? "No service events logged yet — record one and start crediting the members who show up."
                : <>
                    <b>{r1(total)} hours</b> logged across {events.length} {events.length === 1 ? "event" : "events"}.
                    {behind > 0 ? ` ${behind} ${behind === 1 ? "member is" : "members are"} still short of the ${goal}h goal.` : ` Every member has hit the ${goal}h goal.`}
                    {next && <> Next up: <b>{next.title}</b>, {relWhen(next.date, today).toLowerCase()}.</>}
                  </>}
            </span>
          </p>}
        </div>
        <div className="psv-acts-top">
          {props.canService && <button className="psv-btn" onClick={props.onNew}><PaperIcon name="plus" />New service event</button>}
          <button className="psv-btn ghost" onClick={props.onLogMine} disabled={!hasPast} title={hasPast ? undefined : "No service events yet"}>
            <PaperIcon name="clock" />Log my hours
          </button>
          <button className="psv-askbar" onClick={ask}><PaperIcon name="spark" />Ask who’s behind<kbd>⌘K</kbd></button>
        </div>
      </section>

      <section className="psv-meas-row">
        {!hasEvents ? [
          unset("Hours logged", "clock", "mint", "Counts from your first service event."),
          unset("Service events", "heart", "rose", "Cleanups, food banks, fundraisers."),
          unset("On track", "check", "sky", `Everyone’s goal is ${goal}h this term.`),
          unset("Avg / member", "people", "lilac", "Once hours are logged."),
        ] : [
          meas("Hours logged", "clock", "mint", <>{r1(total)}<small>h</small></>, "this term"),
          meas("Service events", "heart", "rose", events.length, `${upcomingAll.length} coming up`),
          meas("On track", "check", "sky", <>{onTrack}<small>/{roster.length}</small></>, `${goal}h goal`, roster.length > 0 && onTrack < roster.length),
          meas("Avg / member", "people", "lilac", <>{r1(Math.round((total / Math.max(1, roster.length)) * 10) / 10)}<small>h</small></>, "hours"),
        ]}
      </section>

      <div className="psv-tools">
        <label className="psv-search">
          <PaperIcon name="search" />
          <input type="search" value={search} onChange={e => props.setSearch(e.target.value)}
            placeholder={view === "events" ? "Search events…" : "Search members…"} aria-label="Search" autoComplete="off" />
        </label>
        <div className="psv-tabs" role="tablist" aria-label="View">
          {(["events", "members"] as const).map(k => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => props.setView(k)}>{k === "events" ? "Events" : "Members"}</button>
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
            <h3>No service events yet.</h3>
            <p>{props.canService
              ? "Log your first cleanup, food bank or fundraiser — then record who showed up and how long they stayed. It lands on the Timeline too."
              : "Ask an officer to log the chapter’s service events — then your hours land here."}</p>
            {props.canService && <div className="actions"><button className="psv-btn" onClick={props.onNew}><PaperIcon name="plus" />New service event</button></div>}
          </div>
        ) : evF.length === 0 ? (
          <div className="psv-calm">
            <span className="art"><PaperIcon name="search" /></span>
            <div><h4>Nothing matches.</h4><p>Try a different search — it looks at titles and locations.</p>
              <button className="psv-btn sm ghost" onClick={() => props.setSearch("")}>Clear search</button></div>
          </div>
        ) : (
          <>
            {up.length > 0 && <>
              <div className="psv-sec"><h2>Coming up</h2><span className="rule" /><span className="cnt">{up.length}</span></div>
              <div>{up.map(eventCard)}</div>
            </>}
            {past.length > 0 && <>
              <div className="psv-sec"><h2>Logged</h2><span className="rule" /><span className="cnt">{past.length} · newest first</span></div>
              <div>{past.map(eventCard)}</div>
            </>}
          </>
        )
      ) : props.rosterLoading ? (
        <div className="psv-loading"><LoadingSpinner size="md" tone="dusk" label="Loading members" /></div>
      ) : rosF.length === 0 ? (
        <div className="psv-calm">
          <span className="art"><PaperIcon name="search" /></span>
          <div><h4>No members found.</h4><p>Try a different search.</p></div>
        </div>
      ) : (
        <>
          <div className="psv-legend">
            <span style={{ ["--c" as string]: "var(--pp-mint)" }}><i />On track · {goal}h+</span>
            <span style={{ ["--c" as string]: "var(--pp-butter)" }}><i />Halfway</span>
            <span style={{ ["--c" as string]: "var(--pp-peach)" }}><i />Under half</span>
            <span>One hole per hour of the goal — punched as hours land.</span>
          </div>
          <div className="psv-cards">
            {rosF.map(b => {
              const hh = b.serviceHours;
              const st = standing(hh, goal);
              const you = b.id === selfId;
              const holes = Math.max(0, Math.min(goal, 40));
              return (
                <button key={b.id} className={`psv-card ${st}${you ? " you" : ""}`} onClick={() => props.onMember(b)}>
                  {props.avatar(b, "sm")}
                  <span className="nm">{b.name}<small>{roleTitle(b) || "Member"}{you ? " · you" : ""}</small></span>
                  <span className="hr">{r1(hh)}<i>/{goal}h</i></span>
                  <span className="psv-holes">
                    {Array.from({ length: holes }, (_, i) => <i key={i} className={i < Math.floor(hh) ? "p" : ""} />)}
                    {hh > goal ? <span className="x">+{r1(hh - goal)}</span>
                      : hh < goal ? <span className="short">{r1(goal - hh)} to go</span>
                      : <span className="x">done</span>}
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
