"use client";
// Add an event the way the app does: the event sheet open over the Timeline,
// and on "Add event" the sheet condenses into the event's own card, flies to its
// date while the rows part, and a stamp lands on it — the sequence of
// components/timeline/event-landing.ts, played here on the demo's own spine.
// The More details page is the app's own editor (EventDetailsEditor), styled by
// its own stylesheet; timeline.css only maps its tokens onto the blog's palette.
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DETAIL_KINDS, detailSummary, type EventDetail } from "@/lib/event-details";
import { EventDetailsEditor, type DetailMember } from "@/app/components/timeline/EventDetailsEditor";
import { DETAIL_ICON, UI_ICON } from "@/app/components/timeline/detail-icons";
import "@/app/components/timeline/event-details.css";
import { SEMESTER, TYPES, byWhen, clock, dayNum, monthOf, shortDate, typeOf, weekday, type Ev } from "./timeline-data";
import { MENTIONS } from "./roster";
import { WindowBar } from "./chrome";

const TODAY = "2026-10-18";
const EASE = "cubic-bezier(.6,0,.12,1)";
const START = SEMESTER.filter(e => e.key !== "formal");
const CREATABLE = TYPES.filter(t => t.creatable);
const SUGGEST = [
  { title: "Pumpkin carving", type: "party", date: "2026-10-18", start: "18:00", end: "20:00", place: "The house" },
  { title: "Fall formal", type: "party", date: "2026-11-21", start: "19:00", end: "23:00", place: "The Grand Hall" },
  { title: "Park cleanup", type: "service", date: "2026-11-01", start: "10:00", end: "13:00", place: "Riverside Park" },
  { title: "Exec board", type: "chapter", date: "2026-10-22", start: "21:00", end: "22:00", place: "Library room 204" },
];
const MEMBERS: DetailMember[] = MENTIONS.filter(m => m.kind === "person").map((m, i) => ({ id: i + 1, name: m.name, title: m.sub }));
const nameOf = (id: number) => MEMBERS.find(m => m.id === id)?.name;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Form = { title: string; type: string; date: string; start: string; end: string; allDay: boolean; place: string; notes: string; required: boolean };
const formFrom = (i: number): Form => {
  const s = SUGGEST[i % SUGGEST.length];
  return { ...s, allDay: false, notes: "", required: typeOf(TYPES, s.type).required };
};
const daysFrom = (iso: string) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${TODAY}T12:00:00Z`)) / 864e5);
const inDays = (iso: string) => { const n = daysFrom(iso); return n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`; };
function span(start: string, end: string) {
  const [a, b] = [start, end].map(t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; });
  const m = b - a;
  if (!start || !end || m <= 0) return "";
  return m % 60 ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} hr ` : ""}${m % 60} min` : `${m / 60} hr`;
}

export function TimelineAdd() {
  const [events, setEvents] = useState<Ev[]>(START);
  const [ends, setEnds] = useState<Record<string, string>>({});
  const [n, setN] = useState(0);
  const [form, setForm] = useState<Form>(() => formFrom(0));
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ key: string; at: number } | null>(null);
  // The More details page: the draft's details, and the event's details once it lands.
  const [page, setPage] = useState<1 | 2>(1);
  const [turn, setTurn] = useState<"in-r" | "in-l" | null>(null);
  const [details, setDetails] = useState<EventDetail[]>([]);
  const [remember, setRemember] = useState(false);
  const [focusDetail, setFocusDetail] = useState<string | null>(null);
  const [extras, setExtras] = useState<Record<string, EventDetail[]>>({});

  const appRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLFormElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const flight = useRef<Animation[]>([]);
  useLayoutEffect(() => () => flight.current.forEach(a => a.cancel()), []);

  const t = typeOf(TYPES, form.type);
  const ok = !!form.title.trim() && !!form.date && !pending;
  function set<K extends keyof Form>(k: K, v: Form[K]) { setForm(f => ({ ...f, [k]: v })); }
  function pickType(id: string) {
    // As in the app: a type that defaults to required ticks the box; picking another never unticks it.
    setForm(f => ({ ...f, type: id, required: typeOf(TYPES, id).required ? true : f.required }));
  }
  function reopen() {
    if (pending) return;
    setForm(formFrom(n)); setLanded(null); setDetails([]); setRemember(false); setPage(1); setTurn(null); setOpen(true);
  }
  function goTo(next: 1 | 2, focus?: string) {
    if (next !== page) setTurn(next > page ? "in-r" : "in-l");
    setPage(next);
    setFocusDetail(focus ?? null);
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ok) return;
    const app = appRef.current, page = pageRef.current, sheet = sheetRef.current;
    const key = `new-${n}`;
    const ev: Ev = { key, title: form.title.trim(), type: form.type, date: form.date, time: form.allDay ? "" : clock(form.start), place: form.place.trim(), required: form.required };
    const before = new Map([...rows.current].map(([k, el]) => [k, el.offsetTop]));
    const from = app && sheet ? relTo(app, sheet.getBoundingClientRect()) : null;
    const ghost = sheet ? cloneLive(sheet) : null;

    flushSync(() => {
      setEvents(list => [...list, ev]);
      setEnds(m => ({ ...m, [key]: form.allDay ? "" : form.end }));
      setExtras(m => ({ ...m, [key]: details }));
      setN(i => i + 1);
      setOpen(false);
      setPending(key);
    });

    const row = rows.current.get(key);
    const card = row?.querySelector<HTMLElement>(".tea-card");
    if (!app || !page || !row || !card || !from || !ghost || reduced()) { land(key); return; }

    // Bring the new slot into view, then part the rows around it.
    const rowTop = row.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop;
    page.scrollTop = Math.max(0, rowTop - page.clientHeight / 2 + row.offsetHeight / 2);
    for (const [k, el] of rows.current) {
      const was = before.get(k);
      if (was === undefined || was === el.offsetTop) continue;
      flight.current.push(el.animate([{ transform: `translateY(${was - el.offsetTop}px)` }, { transform: "none" }], { duration: 560, easing: EASE }));
    }

    // The sheet condenses into the card and flies to its date.
    const to = relTo(app, card.getBoundingClientRect());
    const face = card.cloneNode(true) as HTMLElement;
    face.classList.remove("pending");
    face.classList.add("tea-ghost-face");
    ghost.classList.add("tea-ghost-form");
    ghost.style.setProperty("--w", `${from.width}px`);
    const g = document.createElement("div");
    g.className = "tea-ghost";
    g.style.setProperty("--c", typeOf(TYPES, ev.type).color);
    g.append(ghost, face);
    app.append(g);
    const box = (r: DOMRect, radius: number) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${radius}px` });
    const fly = g.animate([box(from, 22), box(to, 14)], { duration: 640, easing: EASE, fill: "forwards" });
    flight.current.push(
      fly,
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease-out", fill: "forwards" }),
      face.animate([{ opacity: 0 }, { opacity: 0, offset: .35 }, { opacity: 1 }], { duration: 640, fill: "forwards" }),
    );
    fly.onfinish = () => { g.remove(); land(key); };
  }
  function land(key: string) {
    setPending(null);
    setLanded({ key, at: Date.now() });
  }

  const sorted = [...events].sort(byWhen);
  const months = [...new Set(sorted.map(e => monthOf(e.date)))];

  return <div className="bld bld-win tea">
    <WindowBar path="timeline" />
    <div className="tea-app" ref={appRef}>
      <div className="tea-page" ref={pageRef} inert={open || undefined}>
        <header className="tea-top">
          <div>
            <span className="date">Sunday, October 18, 2026</span>
            <h3>The weeks <mark>ahead</mark>.</h3>
          </div>
          <button type="button" className={`tea-add${landed && !open ? " again" : ""}`} onClick={reopen}><Plus />Add event</button>
        </header>

        <div className="tea-today"><span>Today · Sun Oct 18</span><i /></div>

        {months.map(m => {
          const list = sorted.filter(e => monthOf(e.date) === m);
          const req = list.filter(e => e.required).length;
          return <section key={m} className="tea-month">
            <h4><b>{m}</b><small>2026</small><i /><span>{list.length} events{req ? ` · ${req} required` : ""}</span></h4>
            <ol className="tea-spine">
              {list.map((e, i) => {
                const ty = typeOf(TYPES, e.type);
                const sameDay = i > 0 && list[i - 1].date === e.date;
                const isNew = landed?.key === e.key;
                return <li key={e.key} className={`tea-row${isNew ? " landed" : ""}`} style={{ ["--c" as string]: ty.color }}
                  ref={el => { if (el) rows.current.set(e.key, el); else rows.current.delete(e.key); }}>
                  <span className="dd">{!sameDay && <><small>{weekday(e.date)}</small><b>{dayNum(e.date)}</b></>}</span>
                  <span className="node" aria-hidden />
                  <div className={`tea-card${pending === e.key ? " pending" : ""}`}>
                    <div className="tx">
                      <b className="tt">{e.title}</b>
                      <span className="mt">
                        <span className="ty"><i />{ty.label}</span>
                        {e.required && <span className="rq">Required</span>}
                        <span className="tm">{e.time ? `${e.time}${ends[e.key] ? ` – ${clock(ends[e.key])}` : ""}` : "All day"}</span>
                        {!!extras[e.key]?.length && <span className="evd-stack" title={extras[e.key].map(d => DETAIL_KINDS[d.type].name).join(" · ")}>
                          {extras[e.key].slice(0, 5).map(d => <i key={d.id} data-hue={DETAIL_KINDS[d.type].hue}>{DETAIL_ICON[d.type]}</i>)}
                        </span>}
                      </span>
                    </div>
                    <span className="when">{inDays(e.date)}<Chevron /></span>
                    {isNew && <span className="tea-stamp" key={landed.at}>On the timeline<small>{weekday(e.date)}, {shortDate(e.date)}</small></span>}
                  </div>
                </li>;
              })}
            </ol>
          </section>;
        })}
        <p className="tea-end">Nothing scheduled past {shortDate(sorted[sorted.length - 1].date)}. <button type="button" onClick={reopen}>Add event →</button></p>
      </div>

      <div className={`tea-scrim${open ? " on" : ""}`} aria-hidden onClick={() => setOpen(false)} />
      {open && <div className={`tea-dlg p${page}`} style={{ ["--c" as string]: t.color }}>
        <div className="tea-tabs" role="tablist" aria-label="Event pages">
          <button type="button" role="tab" aria-selected={page === 1} onClick={() => goTo(1)}>{UI_ICON.cal}Event</button>
          <button type="button" role="tab" aria-selected={page === 2} onClick={() => goTo(2)}>
            {UI_ICON.pages}More details{details.length > 0 && <span className="n">{details.length}</span>}
          </button>
        </div>
        <form ref={sheetRef} className="tea-sheet cef-root" data-page={page} onSubmit={submit} aria-label="New calendar event"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { submit(e); return; }
            if (e.key === "Escape" && page === 2) { e.preventDefault(); goTo(1); }
          }}>
          <button type="button" className="x" aria-label="Close" onClick={() => setOpen(false)}><Close /></button>
          {page === 2 ? <div key="p2" className={`tea-p2 cef-page${turn ? ` ${turn}` : ""}`}>
            <header className="tea-p2h">
              <button type="button" className="back" aria-label="Back to event" onClick={() => goTo(1)}>{UI_ICON.back}</button>
              <div>
                <span className="kick">More details</span>
                <h4>{form.title.trim() || "Untitled event"}</h4>
                <span className="meta">{form.date && `${weekday(form.date)}, ${shortDate(form.date)}`}{form.allDay ? " · all day" : form.start ? ` · ${t12(form.start)}${form.end ? `–${t12(form.end)}` : ""}` : ""}</span>
              </div>
            </header>
            <EventDetailsEditor details={details} onChange={setDetails} category={form.type} categoryLabel={t.label} categoryColor={t.color} members={MEMBERS} focus={focusDetail} />
            <div className="ft">
              <label className="rem">
                <input type="checkbox" className="sw" checked={remember} onChange={e => setRemember(e.target.checked)} />
                <span>Start every <i style={{ background: t.color }} /><b>{t.label}</b> event with these
                  <small>{remember ? `New ${t.label} events open with the same details, blank.` : "Off — this event only."}</small></span>
              </label>
              <button type="button" className="cancel" onClick={() => goTo(1)}>Back to event</button>
              <button type="submit" className="tea-go" disabled={!ok}>Add event</button>
            </div>
          </div> : <div key="p1" className={`tea-p1 cef-page${turn ? ` ${turn}` : ""}`}>
            <span className="kick">New calendar event</span>
            <input className="title" value={form.title} onChange={e => set("title", e.target.value)} placeholder="Event name" aria-label="Event title" maxLength={60} />

            <div className="rw">
              <span className="ic"><ClockIcon /></span>
              <div className="when">
                <div className="ins">
                  <input type="date" value={form.date} min="2026-10-18" max="2026-11-30" onChange={e => set("date", e.target.value)} aria-label="Date" />
                  {!form.allDay && <>
                    <input type="time" value={form.start} onChange={e => set("start", e.target.value)} aria-label="Starts" />
                    <span className="ar" aria-hidden>→</span>
                    <input type="time" value={form.end} onChange={e => set("end", e.target.value)} aria-label="Ends" />
                  </>}
                </div>
                <div className="sub">
                  <small>{form.allDay ? "All day" : span(form.start, form.end) || "—"} · <u>New York (EDT)</u></small>
                  <label className="ad"><input type="checkbox" className="sw" checked={form.allDay} onChange={e => set("allDay", e.target.checked)} />All day</label>
                </div>
              </div>
            </div>

            <div className="rw">
              <span className="ic"><TagIcon /></span>
              <div>
                <div className="chips" role="radiogroup" aria-label="Event type">
                  {CREATABLE.map(x => (
                    <label key={x.id} className={form.type === x.id ? "on" : ""} style={{ ["--c" as string]: x.color }}>
                      <input type="radio" name="tea-type" checked={form.type === x.id} onChange={() => pickType(x.id)} /><i />{x.label}
                    </label>
                  ))}
                </div>
                {t.required && <small className="note">{t.label} events are required by default.</small>}
              </div>
            </div>

            <label className="rw req">
              <span className="ic"><CheckIcon /></span>
              <span className="lbl"><b>Required attendance</b><small>Take attendance and track excuses.</small></span>
              <input type="checkbox" className="sw" checked={form.required} onChange={e => set("required", e.target.checked)} />
            </label>

            <div className="rw">
              <span className="ic"><PinIcon /></span>
              <input className="quiet" value={form.place} onChange={e => set("place", e.target.value)} placeholder="Add location" aria-label="Location" />
            </div>

            <div className="rw">
              <span className="ic"><NotesIcon /></span>
              <textarea className="quiet" rows={1} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Add notes, agenda, or links" aria-label="Notes" />
            </div>

            <div className="rw">
              <span className="ic">{UI_ICON.pages}</span>
              <div>
                {details.length === 0
                  ? <button type="button" className="cef-more" onClick={() => goTo(2)}>
                    <span className="fan"><i data-hue="mint">{DETAIL_ICON.checklist}</i><i data-hue="butter">{DETAIL_ICON.budget}</i><i data-hue="sky">{DETAIL_ICON.contact}</i></span>
                    <span className="txt"><span className="t">More details</span><span className="s">Checklist, budget, contacts, links — or a field of your own.</span></span>
                    <span className="go">{UI_ICON.arrow}</span>
                  </button>
                  : <>
                    <div className="cef-stamps">
                      {details.map(d => {
                        const label = detailSummary(d, nameOf) ?? DETAIL_KINDS[d.type].name;
                        return <button key={d.id} type="button" className="cef-stamp" data-hue={DETAIL_KINDS[d.type].hue} title={label} onClick={() => goTo(2, d.id)}>
                          <span className="ti">{DETAIL_ICON[d.type]}</span><span>{label}</span>
                        </button>;
                      })}
                    </div>
                    <div className="cef-stamps-foot">
                      <span className="mini">{details.length} extra detail{details.length > 1 ? "s" : ""} saved with this event</span>
                      <button type="button" className="cef-link" onClick={() => goTo(2)}>Edit details →</button>
                    </div>
                  </>}
              </div>
            </div>

            <div className="ft">
              <span className="kbd"><kbd>⌘</kbd><kbd>↵</kbd> to add</span>
              <button type="button" className="cancel" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="tea-go" disabled={!ok}>Add event</button>
            </div>
          </div>}
        </form>
      </div>}
    </div>
  </div>;
}

function t12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
}
function relTo(app: HTMLElement, r: DOMRect) {
  const a = app.getBoundingClientRect();
  return new DOMRect(r.left - a.left, r.top - a.top, r.width, r.height);
}
/** A copy of the live form with what's been typed into it (a clone keeps attributes, not values). */
function cloneLive(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[name]").forEach(x => x.removeAttribute("name"));
  const src = el.querySelectorAll<HTMLInputElement>("input, textarea, select"), dst = copy.querySelectorAll<HTMLInputElement>("input, textarea, select");
  src.forEach((s, i) => { const d = dst[i]; if (!d) return; d.value = s.value; if ("checked" in s) d.checked = s.checked; });
  return copy;
}

const I = ({ d, w = 2 }: { d: string; w?: number }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const Plus = () => <I d="M12 5v14M5 12h14" w={2.4} />;
const Close = () => <I d="M6 6l12 12M18 6L6 18" />;
const Chevron = () => <I d="M9 6l6 6-6 6" />;
const ClockIcon = () => <I d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />;
const TagIcon = () => <I d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM7.5 7.5h.01" />;
const CheckIcon = () => <I d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM8.5 12l2.5 2.5 4.5-5" />;
const NotesIcon = () => <I d="M4 6h16M4 12h16M4 18h10" w={1.8} />;
const PinIcon = () => <I d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />;
