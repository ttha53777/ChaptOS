"use client";

import "./activity-spotlight.css";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActivityEntry, Brother } from "../../../data";
import type { ActivityCategory } from "@/lib/activity-category";
import { useChapter } from "../../../context/ChapterContext";
import { useActiveSemester } from "../../../hooks/useActiveSemester";
import { useOrgPath } from "../../../hooks/useOrgPath";
import { useVocab } from "../../../hooks/useVocab";
import { requestJson } from "../../../lib/api";
import { BrotherAvatar } from "../../BrotherAvatar";
import { isNavVisible } from "../../Sidebar";
import { ACTIVITY_CATEGORY } from "../ledger/ActivityRail";

/*
  Activity Spotlight — what the dashboard's Activity card opens.
  Built from _design/Activity Spotlight Mock.html; replaces the old
  "activity" case of the widget side drawer.

  A centered dialog, deliberately bigger than the event form (that Modal is
  740px; this is up to 1120 × 820), grown out of the card it came from.
  Left: a window (Week / Month / Term) and two filters, What and Who. Right: a
  per-day bar strip counted from the loaded rows, then the log itself, grouped
  by day; a row opens in place to say when, by whom, and where to go.

  The window is fetched (GET /api/activity?since=&limit=&before=); What, Who
  and search filter the rows already loaded, so their counts are of what's
  loaded — the Everything count says "+" while older pages remain.
*/

const PAGE = 100;
const DAY_MS = 86_400_000;

type Range = "week" | "month" | "term";
type Who = "anyone" | "system" | number;

/** Where a row's "Open in …" goes. `nav` is the sidebar label the page sits
 *  under, so a page the org has switched off never gets a button. */
const CATEGORY_DEST: Partial<Record<ActivityCategory, { nav: string; href: string }>> = {
  attendance:  { nav: "Timeline",    href: "/timeline" },
  calendar:    { nav: "Timeline",    href: "/timeline" },
  dues:        { nav: "Treasury",    href: "/treasury?tab=Dues" },
  treasury:    { nav: "Treasury",    href: "/treasury" },
  request:     { nav: "Treasury",    href: "/treasury?tab=Reimbursements" },
  programming: { nav: "Programming", href: "/events" },
  members:     { nav: "Brotherhood", href: "/brothers" },
  service:     { nav: "Service",     href: "/service" },
  parties:     { nav: "Parties",     href: "/parties" },
  fundraisers: { nav: "Fundraisers", href: "/fundraisers" },
  tasks:       { nav: "Tasks",       href: "/tasks" },
  docs:        { nav: "Docs",        href: "/docs" },
  instagram:   { nav: "Instagram",   href: "/instagram" },
  settings:    { nav: "Settings",    href: "/settings" },
  metrics:     { nav: "Settings",    href: "/settings" },
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
/** Whole local days between two instants' midnights (DST-safe via rounding). */
function daysAgo(d: Date, today: Date) { return Math.round((startOfDay(today).getTime() - startOfDay(d).getTime()) / DAY_MS); }

function dayTitle(d: Date, today: Date) {
  const n = daysAgo(d, today);
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}
function dayDate(d: Date, today: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}
function clock(d: Date) { return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }

function rangeStart(range: Range, termStart: string | null, now: Date): Date | null {
  if (range === "week") return new Date(startOfDay(now).getTime() - 6 * DAY_MS);
  if (range === "month") return new Date(startOfDay(now).getTime() - 29 * DAY_MS);
  return termStart ? startOfDay(new Date(`${termStart.slice(0, 10)}T00:00:00`)) : null;
}

function windowPhrase(range: Range, hasTerm: boolean) {
  return range === "week" ? "this week" : range === "month" ? "in the last 30 days" : hasTerm ? "this term" : "so far";
}

/** Wraps each case-insensitive match of `q` in a highlighter mark. */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase(), needle = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, i)) {
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    i = at + needle.length;
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const I = {
  clock:  "M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2ZM12 7.4V12l3.2 2",
  search: "M10.8 4.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2ZM16 16l4.4 4.4",
  x:      "M6 6l12 12M18 6 6 18",
  chev:   "m9 5 7 7-7 7",
  arrow:  "M4 12h15m0 0-6-6m6 6-6 6",
  spark:  "M12 2.6c.7 5.1 3.6 8 8.7 8.8-5.1.7-8 3.6-8.7 8.7-.7-5.1-3.6-8-8.7-8.7 5.1-.8 8-3.7 8.7-8.8Z",
  plant:  "M12 21v-8m0 0c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5Zm0-2C12 8 9.6 5.4 5 5.4c0 4 2.6 5.6 7 5.6Z",
  warn:   "M12 4 2.8 19.6h18.4L12 4ZM12 10v4.2M12 17.2v.1",
  gear:   "M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7",
};

export function ActivitySpotlight({ origin, onClose }: { origin: DOMRect | null; onClose: () => void }) {
  const { brotherList, currentUser, activityFeed, avatarRevision } = useChapter();
  const semester = useActiveSemester();
  const orgPath = useOrgPath();
  const router = useRouter();
  const v = useVocab();

  const [range, setRange] = useState<Range>("month");
  const [cat, setCat] = useState<"all" | ActivityCategory>("all");
  const [who, setWho] = useState<Who>("anyone");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [kb, setKb] = useState(-1);

  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [hasMore, setHasMore] = useState(false);
  const [more, setMore] = useState<"idle" | "loading" | "error">("idle");
  const [reload, setReload] = useState(0);

  // "Today" is fixed for the life of the dialog so the day headers don't
  // re-label themselves at midnight mid-read.
  const [now] = useState(() => new Date());
  const termStart = semester?.startDate ?? null;
  const since = useMemo(() => rangeStart(range, termStart, now), [range, termStart, now]);
  const sinceQs = since ? `&since=${encodeURIComponent(since.toISOString())}` : "";

  useEffect(() => {
    const ctrl = new AbortController();
    setStatus("loading"); setMore("idle"); setSel(null); setKb(-1);
    requestJson<ActivityEntry[]>(`/api/activity?limit=${PAGE}${sinceQs}`, { signal: ctrl.signal })
      .then(r => { setRows(r); setHasMore(r.length === PAGE); setStatus("ready"); })
      .catch(() => { if (!ctrl.signal.aborted) setStatus("error"); });
    return () => ctrl.abort();
  }, [sinceQs, reload]);

  const loadOlder = useCallback(() => {
    const last = rows[rows.length - 1];
    if (!last || more === "loading") return;
    setMore("loading");
    requestJson<ActivityEntry[]>(`/api/activity?limit=${PAGE}&before=${last.id}${sinceQs}`)
      .then(r => { setRows(prev => [...prev, ...r]); setHasMore(r.length === PAGE); setMore("idle"); })
      .catch(() => setMore("error"));
  }, [rows, more, sinceQs]);

  // ── who's who ──────────────────────────────────────────────────────────────
  const byId = useMemo(() => new Map<number, Brother>(brotherList.map(b => [b.id, b])), [brotherList]);
  const selfId = currentUser?.id ?? null;
  const nameOf = useCallback((id: number | null) => {
    if (id == null) return "Automatic";
    if (id === selfId) return "You";
    return byId.get(id)?.name ?? "Former member";
  }, [byId, selfId]);

  // ── filtering ──────────────────────────────────────────────────────────────
  const matchWho = useCallback((e: ActivityEntry) =>
    who === "anyone" || (who === "system" ? e.actorId == null : e.actorId === who), [who]);
  const matchQ = useCallback((e: ActivityEntry) => {
    if (!q) return true;
    const n = q.toLowerCase();
    const label = e.category ? ACTIVITY_CATEGORY[e.category].label(v) : "";
    return e.message.toLowerCase().includes(n) || label.toLowerCase().includes(n) || nameOf(e.actorId).toLowerCase().includes(n);
  }, [q, v, nameOf]);

  const visible = useMemo(() => rows.filter(e => (cat === "all" || e.category === cat) && matchWho(e) && matchQ(e)), [rows, cat, matchWho, matchQ]);

  // Category counts ignore the category filter itself, so picking one doesn't
  // zero out the rest of the list.
  const catCounts = useMemo(() => {
    const c = new Map<ActivityCategory, number>();
    let all = 0;
    for (const e of rows) {
      if (!matchWho(e) || !matchQ(e)) continue;
      all++;
      if (e.category) c.set(e.category, (c.get(e.category) ?? 0) + 1);
    }
    return { all, by: c };
  }, [rows, matchWho, matchQ]);
  const catList = useMemo(() => [...catCounts.by.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k), [catCounts]);

  const whoList = useMemo(() => {
    const c = new Map<number | "system", number>();
    for (const e of rows) c.set(e.actorId ?? "system", (c.get(e.actorId ?? "system") ?? 0) + 1);
    const people = [...c.entries()].filter(([k]) => k !== "system").sort((a, b) => b[1] - a[1]).map(([k]) => k as number);
    const ordered = selfId != null && people.includes(selfId) ? [selfId, ...people.filter(p => p !== selfId)] : people;
    return { people: ordered.slice(0, 8), system: c.has("system") };
  }, [rows, selfId]);

  // If the person picked in Who drops out of a new window, fall back to everyone
  // rather than showing an empty log with no visible reason.
  useEffect(() => {
    if (status !== "ready" || who === "anyone") return;
    if (who === "system" ? !whoList.system : !rows.some(e => e.actorId === who)) setWho("anyone");
  }, [status, who, whoList, rows]);
  useEffect(() => {
    if (status === "ready" && cat !== "all" && !catCounts.by.has(cat) && !q && who === "anyone") setCat("all");
  }, [status, cat, catCounts, q, who]);

  // ── day groups + strip ─────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const out: { key: string; date: Date; rows: ActivityEntry[] }[] = [];
    for (const e of visible) {
      const d = new Date(e.at), k = dayKey(d);
      const g = out[out.length - 1];
      if (g && g.key === k) g.rows.push(e); else out.push({ key: k, date: d, rows: [e] });
    }
    return out;
  }, [visible]);
  const flat = useMemo(() => groups.flatMap(g => g.rows), [groups]);

  const stripDays = range === "week" ? 7 : 14;
  const strip = useMemo(() => {
    const counts = new Array<number>(stripDays).fill(0);
    for (const e of visible) {
      const n = daysAgo(new Date(e.at), now);
      if (n >= 0 && n < stripDays) counts[stripDays - 1 - n]++;
    }
    // While older pages remain, days before the oldest loaded row are unknown,
    // not quiet — they're drawn hollow instead of as a zero.
    const oldest = rows.length ? daysAgo(new Date(rows[rows.length - 1].at), now) : stripDays;
    return counts.map((n, i) => {
      const ago = stripDays - 1 - i;
      return { ago, n, unknown: hasMore && ago > oldest };
    });
  }, [visible, rows, hasMore, stripDays, now]);
  const stripMax = Math.max(1, ...strip.map(s => s.n));
  const weekCount = strip.filter(s => s.ago < 7).reduce((a, s) => a + s.n, 0);
  const busiest = strip.reduce((a, s) => (s.n > a.n ? s : a), strip[strip.length - 1]);

  // ── motion: grow out of the card, shrink back into it ──────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"from" | "in" | "out">("from");
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fromTransform = useCallback(() => {
    const p = panelRef.current;
    if (!p || !origin || reduced) return "";
    const b = p.getBoundingClientRect();
    if (!b.width || !b.height) return "";
    const dx = origin.left + origin.width / 2 - (b.left + b.width / 2);
    const dy = origin.top + origin.height / 2 - (b.top + b.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${origin.width / b.width}, ${origin.height / b.height})`;
  }, [origin, reduced]);

  useLayoutEffect(() => {
    const p = panelRef.current;
    if (!p) return;
    p.style.transform = fromTransform();
    p.getBoundingClientRect();
    const raf = requestAnimationFrame(() => { p.style.transform = ""; setPhase("in"); });
    return () => cancelAnimationFrame(raf);
  }, [fromTransform]);

  const close = useCallback(() => {
    if (phase === "out") return;
    setPhase("out");
    const p = panelRef.current;
    if (p) p.style.transform = fromTransform();
    window.setTimeout(onClose, reduced ? 120 : 300);
  }, [phase, fromTransform, onClose, reduced]);

  // Focus: into the log on open, back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => feedRef.current?.focus({ preventScroll: true }), 60);
    return () => { window.clearTimeout(t); opener?.focus?.({ preventScroll: true }); };
  }, []);

  // ── keyboard ───────────────────────────────────────────────────────────────
  const scrollRowIntoView = useCallback((i: number) => {
    const f = feedRef.current, el = f?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (!f || !el) return;
    const top = el.offsetTop - 52, bot = el.offsetTop + el.offsetHeight;
    if (top < f.scrollTop) f.scrollTop = top;
    else if (bot > f.scrollTop + f.clientHeight) f.scrollTop = bot - f.clientHeight + 12;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inSearch = document.activeElement === searchRef.current;
      if (e.key === "Escape") {
        e.stopPropagation();
        if (inSearch && q) { setQ(""); return; }
        if (sel != null) { setSel(null); return; }
        close();
        return;
      }
      if (e.key === "/" && !inSearch && !e.metaKey && !e.ctrlKey) { e.preventDefault(); searchRef.current?.focus(); return; }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && flat.length) {
        e.preventDefault();
        if (inSearch) searchRef.current?.blur();
        const next = Math.max(0, Math.min(flat.length - 1, kb + (e.key === "ArrowDown" ? 1 : -1)));
        setKb(next); scrollRowIntoView(next);
        return;
      }
      if (e.key === "Enter" && kb >= 0 && !inSearch && !(document.activeElement as HTMLElement | null)?.closest(".asp-btn")) {
        e.preventDefault();
        const id = flat[kb]?.id;
        if (id != null) setSel(s => (s === id ? null : id));
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const f = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex='0'], [tabindex='-1']")].filter(x => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [q, sel, kb, flat, close, scrollRowIntoView]);

  const jumpToDay = (ago: number) => {
    const f = feedRef.current;
    const target = groups.find(g => daysAgo(g.date, now) === ago);
    const el = target && f?.querySelector<HTMLElement>(`[data-day="${target.key}"]`);
    if (f && el) f.scrollTop = el.offsetTop;
  };

  const ask = (e: ActivityEntry) => {
    const when = `${dayDate(new Date(e.at), now)}, ${clock(new Date(e.at))}`;
    close();
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: `Tell me more about this, from ${when}: “${e.message}”` } })), 320);
  };
  const go = (href: string) => { close(); router.push(orgPath(href)); };

  // ── render ─────────────────────────────────────────────────────────────────
  const workflows = currentUser?.org?.enabledWorkflows ?? null;
  const hasTerm = !!termStart;
  const phrase = windowPhrase(range, hasTerm);
  const filtered = cat !== "all" || who !== "anyone" || !!q;
  const dayOne = activityFeed.length === 0 && rows.length === 0 && status === "ready";
  const allCount = `${catCounts.all}${hasMore ? "+" : ""}`;

  const navLabel = (nav: string) => nav === "Brotherhood" ? v("Member", true) : nav === "Treasury" ? v("Treasury") : nav === "Service" ? v("Service") : nav;

  const avatarFor = (id: number | null) => {
    if (id == null) return <span className="asp-av sys" title="Automatic"><Icon d={I.gear} /></span>;
    const b = byId.get(id);
    if (!b) return <span className="asp-av" title="Former member">?</span>;
    return <BrotherAvatar brother={b} selfId={selfId} selfAvatarUrl={currentUser?.avatarUrl ?? null} avatarRevision={avatarRevision} size="xs" className="asp-av-img" />;
  };

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div className="asp-day" aria-busy="true" aria-label="Loading activity">
        <div className="asp-day-h"><i className="asp-skel" style={{ width: 96, height: 15 }} /></div>
        {[62, 48, 80, 55, 70, 44, 66, 58].map((w, i) => (
          <div key={i} className="asp-sk-row">
            <i className="asp-skel" style={{ width: 46, height: 10, justifySelf: "end" }} />
            <i className="asp-skel" style={{ width: 28, height: 28, borderRadius: "50%" }} />
            <i className="asp-skel" style={{ width: `${w}%`, height: 12 }} />
            <i className="asp-skel" style={{ width: 72, height: 16, borderRadius: 99 }} />
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="asp-calm asp-t-peach">
        <span className="art"><Icon d={I.warn} /></span>
        <h4>The log didn&apos;t load.</h4>
        <p>Nothing&apos;s lost. The activity is still recorded; this page just couldn&apos;t fetch it.</p>
        <button type="button" className="asp-btn ink" onClick={() => setReload(n => n + 1)}>Try again</button>
      </div>
    );
  } else if (dayOne) {
    body = (
      <div className="asp-calm asp-t-mint">
        <span className="art"><Icon d={I.plant} /></span>
        <h4>Nothing yet.</h4>
        <p>Every payment, check-in, approval and edit lands here, with who did it and when, the moment it happens.</p>
      </div>
    );
  } else if (!visible.length) {
    body = (
      <div className="asp-calm asp-t-sky">
        <span className="art"><Icon d={I.search} /></span>
        <h4>{q ? <>No match for &ldquo;{q}&rdquo;.</> : `Nothing ${cat !== "all" ? `in ${ACTIVITY_CATEGORY[cat].label(v)} ` : ""}${phrase}.`}</h4>
        <p>{range !== "term" ? "Try a wider window. The whole term is one tap away." : filtered ? "Try a different word, or clear the filters." : "Activity appears here as your chapter uses the app."}</p>
        <div className="acts">
          {range !== "term" && <button type="button" className="asp-btn ghost" onClick={() => setRange("term")}>Show the whole {hasTerm ? "term" : "history"}</button>}
          {filtered && <button type="button" className="asp-btn ink" onClick={() => { setCat("all"); setWho("anyone"); setQ(""); }}>Clear filters</button>}
        </div>
      </div>
    );
  } else {
    let idx = 0;
    body = (
      <>
        {groups.map(g => (
          <section key={g.key} className="asp-day" data-day={g.key}>
            <div className="asp-day-h">
              <h5>{dayTitle(g.date, now)}</h5>
              {daysAgo(g.date, now) < 7 && <span className="date">{dayDate(g.date, now)}</span>}
              <span className="ct">{g.rows.length} {g.rows.length === 1 ? "entry" : "entries"}</span>
            </div>
            <div className="asp-rows">
              {g.rows.map(e => {
                const i = idx++;
                const open = sel === e.id;
                const c = e.category ? ACTIVITY_CATEGORY[e.category] : null;
                const dest = e.category ? CATEGORY_DEST[e.category] : undefined;
                const showDest = dest && (!workflows || isNavVisible(dest.nav, workflows));
                const at = new Date(e.at);
                return (
                  <div key={e.id} className={`asp-row${open ? " open" : ""}${kb === i ? " kb" : ""}`} data-i={i}>
                    <button type="button" className="asp-row-btn" aria-expanded={open} onClick={() => { setSel(open ? null : e.id); setKb(i); }}>
                      <span className="ts">{clock(at)}</span>
                      {avatarFor(e.actorId)}
                      <span className="msg"><span className={`stat ${e.type}`} />{highlight(e.message, q)}</span>
                      <span className="tag">{c && <span className={`asp-pill asp-t-${c.tone}`}>{c.label(v)}</span>}</span>
                      <Icon d={I.chev} className="chev" />
                    </button>
                    <div className="asp-slip" aria-hidden={!open}>
                      <div>
                        <div className="asp-slip-in">
                          <dl>
                            <dt>When</dt><dd>{at.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</dd>
                            <dt>By</dt><dd>{e.actorId === selfId ? `You (${currentUser?.name ?? "you"})` : nameOf(e.actorId)}</dd>
                            <dt>Filed under</dt><dd>{c ? c.label(v) : "—"}</dd>
                          </dl>
                          <div className="acts">
                            <button type="button" className="asp-btn ghost" tabIndex={open ? 0 : -1} onClick={() => ask(e)}><Icon d={I.spark} />Ask Chapt</button>
                            {showDest && (
                              <button type="button" className="asp-btn ink" tabIndex={open ? 0 : -1} onClick={() => go(dest.href)}>
                                Open in {navLabel(dest.nav)}<Icon d={I.arrow} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {hasMore ? (
          <div className="asp-more">
            <button type="button" className="asp-btn ghost" onClick={loadOlder} disabled={more === "loading"}>
              {more === "loading" ? "Loading…" : more === "error" ? "Couldn't load. Try again" : "Show older"}
            </button>
          </div>
        ) : (
          <p className="asp-end">That&apos;s everything {phrase}{filtered ? " that matches" : ""}.</p>
        )}
      </>
    );
  }

  const lede = status !== "ready" || dayOne
    ? "Everything your chapter does, who did it, and when."
    : <>Newest first · <b>{filtered ? visible.length : allCount}</b> {filtered ? "shown" : phrase}</>;

  return createPortal(
    <div className={`asp-overlay ${phase}`} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panelRef} className="asp" role="dialog" aria-modal="true" aria-labelledby="asp-title">
        <header className="asp-h">
          <span className="asp-tile asp-t-rose"><Icon d={I.clock} /></span>
          <div className="asp-title">
            <h2 id="asp-title">Activity</h2>
            <p className="lede">{lede}</p>
          </div>
          <label className="asp-search">
            <Icon d={I.search} />
            <input ref={searchRef} type="search" value={q} onChange={e => { setQ(e.target.value); setKb(-1); }} placeholder="Search names, amounts, events…" aria-label="Search activity" autoComplete="off" />
            <kbd>/</kbd>
          </label>
          <button type="button" className="asp-x" onClick={close} aria-label="Close"><Icon d={I.x} /></button>
        </header>

        <div className="asp-b">
          <aside className={`asp-rail${status === "loading" ? " stale" : ""}`} aria-label="Filters">
            <div className="asp-rng">
              <h4>When</h4>
              <div className="asp-seg" role="group" aria-label="Window">
                {(["week", "month", "term"] as const).map(r => (
                  <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
                    {r === "week" ? "Week" : r === "month" ? "Month" : hasTerm ? "Term" : "All"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4>What</h4>
              <div className="asp-cats">
                <button type="button" className="asp-cat" aria-pressed={cat === "all"} onClick={() => setCat("all")}>
                  <span className="sw all" />Everything<span className="n">{status === "ready" ? allCount : ""}</span>
                </button>
                {catList.map(k => {
                  const c = ACTIVITY_CATEGORY[k];
                  return (
                    <button key={k} type="button" className={`asp-cat asp-t-${c.tone}`} aria-pressed={cat === k} onClick={() => setCat(cat === k ? "all" : k)}>
                      <span className="sw" />{c.label(v)}<span className="n">{catCounts.by.get(k)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {(whoList.people.length > 1 || whoList.system) && (
              <div className="asp-who">
                <h4>Who</h4>
                <div className="asp-cats">
                  <button type="button" className="asp-cat who" aria-pressed={who === "anyone"} onClick={() => setWho("anyone")}>
                    <span className="asp-av any" />Anyone<span className="n" />
                  </button>
                  {whoList.people.map(id => (
                    <button key={id} type="button" className="asp-cat who" aria-pressed={who === id} onClick={() => setWho(who === id ? "anyone" : id)}>
                      {avatarFor(id)}<span className="nm">{nameOf(id)}</span><span className="n" />
                    </button>
                  ))}
                  {whoList.system && (
                    <button type="button" className="asp-cat who" aria-pressed={who === "system"} onClick={() => setWho(who === "system" ? "anyone" : "system")}>
                      {avatarFor(null)}Automatic<span className="n" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>

          <div className="asp-book">
            {status === "ready" && !dayOne && (
              <div className="asp-strip">
                <p className="sum">
                  <b>{weekCount}</b>{weekCount === 1 ? "thing" : "things"} this week
                  {weekCount > 0 && busiest && <> · busiest {busiest.ago === 0 ? "today" : busiest.ago === 1 ? "yesterday" : dayTitle(new Date(now.getTime() - busiest.ago * DAY_MS), now)}</>}
                </p>
                <div className="asp-bars" role="group" aria-label={`Entries per day, last ${stripDays} days`}>
                  {strip.map(s => {
                    const d = new Date(now.getTime() - s.ago * DAY_MS);
                    const label = s.ago === 0 ? "Today" : dayDate(d, now);
                    return (
                      <button
                        key={s.ago} type="button"
                        className={`asp-bar${s.n ? "" : " zero"}${s.unknown ? " unknown" : ""}`}
                        disabled={!s.n}
                        aria-label={`${label}: ${s.unknown ? "not loaded" : `${s.n} ${s.n === 1 ? "entry" : "entries"}`}`}
                        onClick={() => jumpToDay(s.ago)}
                      >
                        <span className="tip">{label} · {s.unknown ? "not loaded" : s.n}</span>
                        <i style={{ height: `${s.n ? Math.max(12, (s.n / stripMax) * 100) : 6}%` }} />
                        {(s.ago % 7 === 0 || s.ago === stripDays - 1) && (
                          <span className="d">{s.ago === 0 ? "today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="legend">last {stripDays} days<br />tap a day to jump</p>
              </div>
            )}
            <div className="asp-feed" ref={feedRef} tabIndex={-1}>{body}</div>
          </div>
        </div>

        <footer className="asp-f">
          <span>{semester ? semester.label : "All time"}{status === "ready" && rows.length > 0 ? ` · ${rows.length}${hasMore ? "+" : ""} loaded` : ""}</span>
          <div className="keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>/</kbd> search</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
