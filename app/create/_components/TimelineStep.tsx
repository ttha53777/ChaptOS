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

import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import {
  EVENT_TYPE_SUGGESTIONS,
  MAX_DRAFT_EVENT_TYPES,
  nextEventTypeColor,
  type DraftEventTypeRow,
} from "@/lib/onboarding/event-types";
import { EVENT_TYPE_PALETTE, getBuiltinEventType, type EventTypeColor } from "@/lib/event-types";
import { draftEventTypes, draftVocab, type FlowAction } from "./flow-state";

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

/** One honest sample per built-in slug — enough to show the color doing work. */
const SAMPLES: Record<string, { title: string | null; when: string; day: (m: ReturnType<typeof sampleMonth>) => number }> = {
  // null title = follow the type's live label, so renaming Chapter renames this row.
  chapter:  { title: null,               when: "7:00 PM · weekly", day: m => nthWeekday(m.year, m.month, 0, 1) },
  service:  { title: "Volunteer morning", when: "9:00 AM",         day: m => nthWeekday(m.year, m.month, 6, 2) },
  party:    { title: "Formal",            when: "10:00 PM",        day: m => nthWeekday(m.year, m.month, 5, 4) },
  deadline: { title: "Dues due",          when: "11:59 PM",        day: m => m.lastDay },
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

  useEffect(() => {
    if (openSlug) setOpen(openSlug);
  }, [openSlug]);

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
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
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
      <div className="ask et-ask">
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
            <div className="tlp-spine">
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
