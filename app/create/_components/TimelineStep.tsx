"use client";

/**
 * Step 4 — YOUR TIMELINE. The categories every timeline entry gets tagged with.
 *
 * Left: the editor. Built-ins (from lib/event-types.ts) can be renamed and
 * recolored but never removed — their slugs are load-bearing. Custom types (the
 * org type's starter set, plus anything the founder adds) are add/remove too. A
 * type whose gating page is off renders as a GHOST row rather than disappearing:
 * the cheapest way to teach "your types follow your pages", and it stays true
 * because provisionOrg seeds the row either way.
 *
 * Right: a sample month. One row per active type, so a rename or recolor shows
 * its consequence immediately — the preview is the explanation.
 *
 * All state resolution goes through draftEventTypes (flow-state), the same
 * function draftToCreateOrgInput maps the payload from, so the preview can't
 * promise something provisioning won't build.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import {
  EVENT_TYPE_SUGGESTIONS,
  MAX_DRAFT_EVENT_TYPES,
  nextEventTypeColor,
  type DraftEventTypeRow,
} from "@/lib/onboarding/event-types";
import { EVENT_TYPE_PALETTE, getBuiltinEventType, type EventTypeColor } from "@/lib/event-types";
import { draftEventTypes, draftVocab, type FlowAction } from "./flow-state";

/* ─── Scroll system ──────────────────────────────────────────────────────────
   Ported from the mock: every scrollable surface on this step shares one
   language. No visible scrollbar — an edge-fade mask is the affordance, and it
   appears only in the direction that actually HAS more content, so a fade always
   means "there's more that way". Content slips under a fixed band above the rail
   instead of hard-clipping (see .crf .scr[data-step="timeline"]::after).

   Edits follow themselves: adding a type or opening a color strip pulls that row
   into view with a container scrollTo — never scrollIntoView, which would also
   scroll the page behind it. */

/** Toggle the edge-fade classes for one scroller against its current position. */
function paintFades(el: HTMLElement | null) {
  if (!el) return;
  const canScroll = el.scrollHeight > el.clientHeight + 2;
  el.classList.toggle("scroll-top", canScroll && el.scrollTop > 6);
  el.classList.toggle("scroll-bot", canScroll && el.scrollTop < el.scrollHeight - el.clientHeight - 6);
}

/**
 * Wire a scroll region: repaints its fades on scroll, on resize, and whenever
 * `deps` change (a row added, a strip opened — anything that resizes content).
 */
function useFadeScroll(deps: unknown[]) {
  const ref = useRef<HTMLDivElement | null>(null);
  const repaint = useCallback(() => paintFades(ref.current), []);

  useLayoutEffect(repaint);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", repaint, { passive: true });
    window.addEventListener("resize", repaint);
    // Rows animate in and color strips expand via CSS transitions, which resize
    // the content WITHOUT a React render — so a render-time repaint alone leaves
    // a stale fade behind (a "there's more below" edge over content that already
    // fits). Observing the box catches those.
    const ro = new ResizeObserver(repaint);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", repaint);
      window.removeEventListener("resize", repaint);
      ro.disconnect();
    };
  }, [repaint, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(repaint, deps);

  return { ref, repaint };
}

/** Scroll `el` fully into view WITHIN `container` (never the page). */
function ensureVisible(container: HTMLElement | null, el: HTMLElement | null, pad = 24) {
  if (!container || !el) return;
  const cr = container.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  if (er.top < cr.top + pad) {
    container.scrollTo({ top: container.scrollTop + (er.top - cr.top) - pad, behavior: "smooth" });
  } else if (er.bottom > cr.bottom - pad) {
    container.scrollTo({ top: container.scrollTop + (er.bottom - cr.bottom) + pad, behavior: "smooth" });
  }
}

/* ─── Sample month ───────────────────────────────────────────────────────── */

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The nth (1-based) `weekday` of a month, clamped to the last one that exists. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(year, month, 1).getDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  const last = new Date(year, month + 1, 0).getDate();
  return day > last ? day - 7 : day;
}

/**
 * Next month, as the preview's frame. Deliberately a real month with real
 * weekdays — a hardcoded calendar reads as a screenshot, and the point is that
 * this is the founder's timeline.
 */
function sampleMonth() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { year: date.getFullYear(), month: date.getMonth(), lastDay: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() };
}

/**
 * One honest sample per slug — enough to show the color doing work. Covers the
 * 4 built-ins plus every org-type-seeded starter custom (lib/org-types.ts
 * `eventTypeSeeds`): the platform can vouch for a plausible example of either,
 * since both come from its own vocabulary. A founder-typed custom has no entry
 * here on purpose — nobody can guess what someone's own "Rush Week" means, so
 * it keeps the honest scaffold in previewRows() below.
 */
const SAMPLES: Record<string, { title: string | null; when: string; day: (m: ReturnType<typeof sampleMonth>) => number }> = {
  // null title = follow the type's live label, so renaming Chapter renames this row.
  chapter:  { title: null,               when: "7:00 PM · weekly", day: m => nthWeekday(m.year, m.month, 0, 1) },
  service:  { title: "Volunteer morning", when: "9:00 AM",         day: m => nthWeekday(m.year, m.month, 6, 2) },
  party:    { title: "Formal",            when: "10:00 PM",        day: m => nthWeekday(m.year, m.month, 5, 4) },
  deadline: { title: "Dues due",          when: "11:59 PM",        day: m => m.lastDay },

  // Org-type starter customs (lib/org-types.ts eventTypeSeeds) — shared slugs
  // (social/fundraiser/workshop) cover every template that reuses them.
  social:          { title: "Mixer",                when: "9:00 PM",         day: m => nthWeekday(m.year, m.month, 5, 2) },
  fundraiser:      { title: "Fundraiser night",      when: "6:00 PM",        day: m => nthWeekday(m.year, m.month, 3, 3) },
  programming:     { title: "Speaker night",         when: "7:00 PM",        day: m => nthWeekday(m.year, m.month, 2, 2) },
  workshop:        { title: "Resume workshop",       when: "6:00 PM",        day: m => nthWeekday(m.year, m.month, 4, 3) },
  game:            { title: "Home game",             when: "1:00 PM",        day: m => nthWeekday(m.year, m.month, 6, 2) },
  practice:        { title: "Practice",              when: "5:30 PM · weekly", day: m => nthWeekday(m.year, m.month, 2, 1) },
  tournament:      { title: "Tournament",            when: "9:00 AM",        day: m => nthWeekday(m.year, m.month, 6, 3) },
  "service-project": { title: "Beach cleanup",       when: "9:00 AM",        day: m => nthWeekday(m.year, m.month, 6, 3) },
  outreach:        { title: "Community outreach",    when: "2:00 PM",        day: m => nthWeekday(m.year, m.month, 3, 2) },
  induction:       { title: "Induction ceremony",    when: "6:00 PM",        day: m => nthWeekday(m.year, m.month, 4, 1) },
  performance:     { title: "Performance",           when: "7:30 PM",        day: m => nthWeekday(m.year, m.month, 6, 4) },
  auditions:       { title: "Auditions",             when: "4:00 PM",        day: m => nthWeekday(m.year, m.month, 6, 1) },
};

interface PreviewRow {
  key: string;
  day: number | null;
  dow: string;
  color: string;
  label: string;
  title: string;
  when: string;
  scaffold: boolean;
}

function previewRows(rows: DraftEventTypeRow[], month: ReturnType<typeof sampleMonth>): PreviewRow[] {
  const dated: PreviewRow[] = [];
  const scaffolds: PreviewRow[] = [];

  for (const row of rows) {
    if (!row.active) continue;
    const sample = SAMPLES[row.slug];
    if (sample) {
      const day = sample.day(month);
      dated.push({
        key:      row.slug,
        day,
        dow:      DOW[new Date(month.year, month.month, day).getDay()]!,
        color:    row.colorDark,
        label:    row.label,
        title:    sample.title ?? row.label,
        when:     sample.when,
        scaffold: false,
      });
    } else {
      // Anything without a canned sample (every custom type) shows as a dashed
      // placeholder — an honest "this is where yours will land", not a fake event.
      scaffolds.push({
        key:      row.slug,
        day:      null,
        dow:      "",
        color:    row.colorDark,
        label:    row.label,
        title:    `First ${row.label.toLowerCase()} — add it after the build`,
        when:     "",
        scaffold: true,
      });
    }
  }

  dated.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  return [...dated, ...scaffolds];
}

/* ─── Rows ───────────────────────────────────────────────────────────────── */

/** Click-to-rename type name (same interaction as the Roles step's titles). */
function TypeName({ label, onRename }: { label: string; onRename: (label: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span className="nm" title="Click to rename" onClick={() => setEditing(true)}>
        {label}
      </span>
    );
  }
  return (
    <input
      defaultValue={label}
      autoFocus
      aria-label={`Rename ${label}`}
      onFocus={e => e.target.select()}
      onBlur={e => {
        onRename(e.target.value);
        setEditing(false);
      }}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
      }}
    />
  );
}

function Swatches({ current, onPick }: { current: string; onPick: (c: { color: string; colorDark: string }) => void }) {
  return (
    <div className="sws">
      {EVENT_TYPE_PALETTE.map(c => (
        <button
          key={c.id}
          className={`sw${c.colorDark.toLowerCase() === current.toLowerCase() ? " on" : ""}`}
          style={{ ["--sc" as string]: c.colorDark }}
          title={c.label}
          aria-label={`Use ${c.label}`}
          onClick={() => onPick({ color: c.color, colorDark: c.colorDark })}
        />
      ))}
    </div>
  );
}

/** The page a type belongs to, in the founder's own words. */
function pageName(workflowId: string | null, meetingsLabel: string): string {
  switch (workflowId) {
    case "meetings": return meetingsLabel;
    case "tasks":    return "Tasks";
    case "events":   return "Events";
    case "parties":  return "Parties";
    case "service":  return "Service";
    default:         return "that";
  }
}

/**
 * One editor row. Module-level (not nested in TimelineStep) on purpose: a
 * component redefined inside a render is a new type every time, which remounts
 * the row and drops the rename input's focus on the first keystroke.
 */
function TypeRow({
  row,
  meetingsLabel,
  open,
  onToggle,
  dispatch,
}: {
  row: DraftEventTypeRow;
  meetingsLabel: string;
  open: boolean;
  onToggle: () => void;
  dispatch: React.Dispatch<FlowAction>;
}) {
  const builtin = getBuiltinEventType(row.slug);
  const page = pageName(row.workflowId, meetingsLabel);
  return (
    <div
      className={`et-row${row.active ? "" : " ghost"}${open ? " open" : ""}`}
      style={{ ["--tc" as string]: row.colorDark }}
    >
      <button
        className="et-dot"
        title={row.active ? "Change color" : undefined}
        aria-label={row.active ? `Change color of ${row.label}` : row.label}
        disabled={!row.active}
        onClick={onToggle}
      />
      <div className="et-name">
        {row.active ? (
          <TypeName label={row.label} onRename={label => dispatch({ type: "renameEventType", slug: row.slug, label })} />
        ) : (
          <span className="nm">{row.label}</span>
        )}
        {!row.active && <span className="et-ghost-note">arrives when you turn the {page} page on</span>}
      </div>
      <div className="et-side">
        <span className={`et-src${row.builtin ? "" : " you"}`}>
          {row.builtin ? `${page} page`.toUpperCase() : "YOURS"}
        </span>
        {!row.builtin && (
          <button
            className="et-x"
            title={`Remove ${row.label}`}
            aria-label={`Remove ${row.label}`}
            onClick={() => dispatch({ type: "removeEventType", slug: row.slug })}
          >
            ×
          </button>
        )}
      </div>
      {row.active && (
        <div className="et-more">
          <div className="et-more-in">
            <Swatches
              current={row.colorDark}
              onPick={c => dispatch({ type: "recolorEventType", slug: row.slug, ...c })}
            />
            <p className="et-note">
              {builtin
                ? builtin.creatable
                  ? `Comes with your ${page} page — these land on the timeline in this color.`
                  : `Booked from the ${page} page — every one lands on the timeline in this color.`
                : row.workflowId === "events"
                  ? "A starter for your kind of org — remove it if it isn't your word."
                  : "Yours — always on the timeline, whichever pages you run."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── The step ───────────────────────────────────────────────────────────── */

export function TimelineStep({
  draft,
  dispatch,
  openSlug,
  onContinue,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  /** A type to open the color strip for — set when a blueprint chip deep-links here. */
  openSlug?: string | null;
  onContinue: () => void;
}) {
  const rows = draftEventTypes(draft);
  const [open, setOpen] = useState<string | null>(openSlug ?? null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<EventTypeColor>(() => nextEventTypeColor(rows));
  const listEnd = useRef<HTMLDivElement | null>(null);

  // Both scroll regions repaint their fades whenever the content that fills them
  // changes — a type added or removed, a strip opened, the adder unfolding.
  const askCol = useFadeScroll([rows.length, open, adding]);
  const spine = useFadeScroll([rows.length, open]);

  useEffect(() => {
    if (openSlug) setOpen(openSlug);
  }, [openSlug]);

  // A deep-linked row (or one whose strip just expanded) is pulled into view
  // after the 320ms max-height transition, so it's never half off-screen.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      ensureVisible(askCol.ref.current, askCol.ref.current?.querySelector(".et-row.open") ?? null);
      askCol.repaint();
    }, 340);
    return () => clearTimeout(t);
  }, [open, askCol]);

  // Wheel deltas over the step's non-scrolling chrome (the split's gaps, the
  // preview card's header and legend) are routed to the surface they visually
  // belong to, so the page never feels dead under the cursor.
  useEffect(() => {
    const onWheel = (ev: WheelEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target?.closest('.scr[data-step="timeline"]')) return;
      if (target.closest(".et-ask, .tlp-spine")) return; // the browser has it
      const el = target.closest(".sheet-slot") ? spine.ref.current : askCol.ref.current;
      if (el) el.scrollTop += ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, [askCol.ref, spine.ref]);

  const meetingsLabel = draftVocab(draft, "Meetings");
  const active = rows.filter(r => r.active);
  const ghosts = rows.filter(r => !r.active);
  const customCount = rows.filter(r => !r.builtin).length;
  const month = sampleMonth();
  const preview = previewRows(rows, month);

  function commitAdd() {
    const label = newLabel.trim();
    if (!label) return;
    dispatch({ type: "addEventType", label, color: newColor.color, colorDark: newColor.colorDark });
    setNewLabel("");
    setAdding(false);
    // Follow the new type on BOTH sides — its row on the left, its scaffold on
    // the right — so the cause and its effect are visible in one gesture.
    requestAnimationFrame(() => {
      ensureVisible(askCol.ref.current, listEnd.current);
      spine.ref.current?.scrollTo({ top: spine.ref.current.scrollHeight, behavior: "smooth" });
    });
  }

  function openAdder() {
    setNewColor(nextEventTypeColor(rows));
    setAdding(true);
  }

  const suggestions = (EVENT_TYPE_SUGGESTIONS[draft.kind ?? "other"] ?? []).filter(
    s => !rows.some(r => r.label.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="split">
      <div className="ask et-ask fade-scroll" ref={askCol.ref}>
        <p className="kicker">Step 4 · Your timeline</p>
        <h1 className="q-serif">
          What lands on your <em>timeline</em>?
        </h1>
        <p className="sub lead">
          These are just the categories your org runs — meetings, service, socials, whatever fits.
          Everything you add to the timeline gets tagged with one, so it stays easy to sort later.
        </p>

        <div className="et-list">
          {[...active, ...ghosts].map(row => (
            <TypeRow
              key={row.slug}
              row={row}
              meetingsLabel={meetingsLabel}
              open={open === row.slug}
              onToggle={() => setOpen(open === row.slug ? null : row.slug)}
              dispatch={dispatch}
            />
          ))}
          <div ref={listEnd} />
        </div>

        <div className="et-add">
          {!adding ? (
            customCount < MAX_DRAFT_EVENT_TYPES ? (
              <button className="et-add-btn" onClick={openAdder}>
                <span className="plus">+</span>Add your own
                {suggestions.length > 0 && (
                  <>
                    {" — "}
                    <b>{suggestions.slice(0, 3).join(", ")}…</b>
                  </>
                )}
              </button>
            ) : (
              <p className="et-cap-note">That&rsquo;s {MAX_DRAFT_EVENT_TYPES} categories — plenty to start. You can add more in Settings later.</p>
            )
          ) : (
            <div className="et-editor">
              <input
                className="newname"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                aria-label="New event type name"
                placeholder="Name it — Rush, Formal…"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") commitAdd();
                  if (e.key === "Escape") setAdding(false);
                }}
              />
              {suggestions.length > 0 && (
                <div className="sugg">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => setNewLabel(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="lab">Its color on the timeline</div>
              <Swatches current={newColor.colorDark} onPick={c => setNewColor({ ...newColor, ...c })} />
              <div className="et-ed-foot">
                <button className="et-ed-add" disabled={!newLabel.trim()} onClick={commitAdd}>
                  Add to timeline<span>&nbsp;→</span>
                </button>
                <button className="et-ed-cancel" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <button className="cta" onClick={onContinue}>
          Looks right — review the blueprint<span>→</span>
        </button>
        <p className="fine">
          {rows.filter(r => r.builtin).length} from your pages
          {customCount > 0 && <> · {customCount} yours</>} — built-ins stay, yours come and go. Every one
          is editable in Settings later.
        </p>
      </div>

      <div className="sheet-slot">
        <div className="tlp-wrap">
          <div className="tlp-cap">Sample month — how your timeline reads</div>
          <div className="tlp-sheet">
            <div className="tlp-month">
              <h2>
                {MONTHS[month.month]}
                <span className="yr">&rsquo;{String(month.year).slice(2)}</span>
              </h2>
              <span className="rule" />
              <span className="cnt">{active.length} categories</span>
            </div>
            <div className="tlp-spine fade-scroll" ref={spine.ref}>
              {preview.length === 0 && (
                // Reachable: a founder who turned every activity page off has no
                // active type yet. Say so plainly instead of rendering a blank
                // card — the ghost rows on the left are the fix, and the adder
                // below them works regardless.
                <p className="tlp-empty">
                  Nothing lands here yet — every category above is waiting on a page. Turn one on at
                  the blueprint, or add a category of your own.
                </p>
              )}
              {preview.map(row => (
                <div
                  key={row.key}
                  className={`tlp-row${row.scaffold ? " scaf" : ""}`}
                  style={{ ["--tc" as string]: row.color }}
                >
                  <div className="tlp-date">
                    <div className="dow">{row.dow}</div>
                    <div className="dnum">{row.day ?? "—"}</div>
                  </div>
                  <div className="tlp-node">
                    <span className="dot">
                      <i />
                    </span>
                  </div>
                  <div className="tlp-body">
                    <div className="tlp-card">
                      {row.scaffold && <span className="plus">+</span>}
                      <div className="grow">
                        <div className="t">{row.title}</div>
                        <div className="cat">{row.label}</div>
                      </div>
                      {row.when && <span className="when">{row.when}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="tlp-legend" hidden={active.length === 0}>
              <h6>Your palette</h6>
              <div className="lgd">
                {active.map(row => (
                  <span key={row.slug} className="li" style={{ ["--tc" as string]: row.colorDark }}>
                    <span className="d" />
                    <span className="nm">{row.label}</span>
                    {!row.builtin && <span className="src you">YOU</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
