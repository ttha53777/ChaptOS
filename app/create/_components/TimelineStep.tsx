"use client";

/**
 * Step 4 — EVENT CATEGORIES (_design/Org Creation Timeline Step Paper Mock.html).
 * The categories every dated thing gets filed under, as a sheet of tick tiles:
 * tick = it's on the timeline, tap the name to rename, tap the sticker to
 * recolour, add your own. A built-in whose page is off is simply an unticked
 * tile that says which page ticking it brings along.
 *
 * Beside it, the explanation shown rather than told: the add-event card the
 * founder will meet later, whose Category choices ARE the ticked tiles, and a
 * sample week in those colours — clearly labelled as made-up; the real
 * timeline starts empty. One category is always "in hand" and mirrored on its
 * tile, the card and the week.
 */

import { useEffect, useRef, useState } from "react";
import type { PaperIconName } from "@/app/components/paper/PaperIcon";
import type { Draft } from "@/lib/onboarding/draft";
import {
  EVENT_TYPE_SUGGESTIONS,
  MAX_DRAFT_EVENT_TYPES,
  nextEventTypeColor,
  starterEventTypes,
  type DraftEventTypeRow,
} from "@/lib/onboarding/event-types";
import { EVENT_TYPE_PALETTE } from "@/lib/event-types";
import type { WorkflowId } from "@/lib/org-types";
import { draftEventTypes, draftVocab, type FlowAction } from "./flow-state";
import { Ic, pageRows } from "./paper";

type Sample = [day: number, title: string, at: string, icon: PaperIconName];

/** Something to draw for each category — keyed by slug (built-ins, starters,
    and the suggestions, whose slugs are their kebab-cased labels). */
const SAMPLE: Record<string, Sample> = {
  party: [4, "Fall formal", "9:00p", "star"],
  deadline: [2, "Dues due", "all day", "flag"],
  service: [5, "Food bank shift", "10:00a", "heart"],
  fundraising: [2, "Charity raffle", "5:00p", "jar"],
  social: [3, "Social night", "8:00p", "mug"],
  fundraiser: [0, "Bake sale", "noon", "cash"],
  programming: [1, "Alumni panel", "6:30p", "board"],
  workshop: [1, "Résumé workshop", "5:00p", "pencil"],
  game: [5, "Home game", "1:00p", "ticket"],
  practice: [0, "Practice", "4:00p", "clock"],
  tournament: [6, "Invitational", "9:00a", "star"],
  "service-project": [5, "Park cleanup", "9:00a", "plant"],
  outreach: [3, "Tabling", "11:00a", "megaphone"],
  induction: [4, "Induction", "7:00p", "key"],
  performance: [4, "Showcase", "7:30p", "spark"],
  auditions: [0, "Auditions", "6:00p", "people"],
  rehearsal: [2, "Rehearsal", "6:00p", "clock"],
  "tech-week": [1, "Tech week", "5:00p", "gear"],
  rush: [0, "Rush kickoff", "6:00p", "hand"],
  recruitment: [0, "Recruitment night", "6:00p", "hand"],
  formal: [5, "Spring formal", "8:00p", "ticket"],
  brotherhood: [1, "Brotherhood night", "8:00p", "people"],
  sisterhood: [1, "Sisterhood night", "8:00p", "people"],
  philanthropy: [6, "Charity 5K", "9:00a", "cash"],
  alumni: [2, "Alumni dinner", "6:30p", "envelope"],
  "guest-speaker": [3, "Guest speaker", "6:00p", "chat"],
  "info-session": [0, "Info session", "5:00p", "doc"],
  scrimmage: [2, "Scrimmage", "4:00p", "flag"],
  "team-dinner": [4, "Team dinner", "7:00p", "cup"],
  "film-session": [1, "Film session", "6:00p", "monitor"],
  tryouts: [0, "Tryouts", "5:00p", "clip"],
  "volunteer-day": [5, "Volunteer day", "9:00a", "hand"],
  drive: [2, "Food drive", "all day", "bag"],
  training: [1, "Training", "6:00p", "pencil"],
  "partner-visit": [3, "Partner visit", "2:00p", "door"],
  "study-session": [1, "Study session", "7:00p", "doc"],
  banquet: [4, "Banquet", "6:30p", "cake"],
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Entry {
  row: DraftEventTypeRow;
  day: number;
  title: string;
  at: string;
  icon: PaperIconName;
  /** False when the title is just the category's own name — nothing to say "e.g." about. */
  example: boolean;
}

function entryFor(draft: Draft, row: DraftEventTypeRow, index: number): Entry {
  if (row.slug === "chapter") {
    const meetings = draftVocab(draft, "Meetings");
    const title = draft.kind === "team" ? "Practice" : /meeting/i.test(meetings) ? meetings : `${meetings} meeting`;
    return { row, day: 6, title, at: "7:00p", icon: "gavel", example: true };
  }
  const s = SAMPLE[row.slug];
  if (s) return { row, day: s[0], title: s[1], at: s[2], icon: s[3], example: true };
  return { row, day: (index * 2 + 1) % 7, title: row.label, at: "7:00p", icon: "pin", example: false };
}

function tone(t: { color: string; colorDark: string }) {
  return { ["--tcl" as string]: t.color, ["--tcd" as string]: t.colorDark };
}

function LabelInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      value={text}
      maxLength={40}
      aria-label="Category name"
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onChange={e => {
        setText(e.target.value);
        if (e.target.value.trim()) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (!text.trim()) setText(value);
      }}
    />
  );
}

function NewEventCard({ entries, held, onHold }: { entries: Entry[]; held: Entry | null; onHold: (slug: string) => void }) {
  if (!held) {
    return (
      <div className="slip">
        <p className="week-0">Tick a category to see how adding an event works.</p>
      </div>
    );
  }
  return (
    <div className="slip">
      <div className="slip-h tc" style={tone(held.row)}>
        <i className="g">
          <Ic name={held.icon} />
        </i>
        <div>
          <small>New event</small>
          <b>{held.title}</b>
        </div>
        <em>
          {DAYS[held.day]} · {held.at}
        </em>
      </div>
      <div className="slip-c">
        <small>Category</small>
        <div className="cps">
          {entries.map(e => (
            <button
              key={e.row.slug}
              type="button"
              className="cp tc"
              style={tone(e.row)}
              aria-pressed={e === held}
              onClick={() => onHold(e.row.slug)}
            >
              {e === held ? <Ic name="check" /> : <i />}
              {e.row.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Week({
  draft,
  entries,
  held,
  dim,
  onHold,
}: {
  draft: Draft;
  entries: Entry[];
  held: Entry | null;
  dim: boolean;
  onHold: (slug: string) => void;
}) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const todayIdx = (now.getDay() + 6) % 7;

  return (
    <div className={`week${dim && held ? " linking" : ""}`}>
      <div className="week-h">
        <b>A week at {draft.name.trim() || "your org"}</b>
      </div>
      {entries.length === 0 ? (
        <p className="week-0">An empty week. Tick a category and watch an event land here.</p>
      ) : (
        days.map((d, i) => {
          const evs = entries.filter(e => e.day === i);
          return (
            <div key={i} className={`day${i === todayIdx ? " today" : ""}`}>
              <span className="d">
                {DAYS[i]}
                <b>{d.getDate()}</b>
              </span>
              <div className="evs">
                {evs.length === 0 && <i className="free" />}
                {evs.map(e => (
                  <div
                    key={e.row.slug}
                    className={`ev tc${e === held ? " lit" : ""}`}
                    style={tone(e.row)}
                    onMouseEnter={() => onHold(e.row.slug)}
                  >
                    <i className="g">
                      <Ic name={e.icon} />
                    </i>
                    <span>
                      {e.title}
                      {e.example && <em>{e.row.label}</em>}
                    </span>
                    <small>{e.at}</small>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
      <div className="week-f">
        <Ic name="eye" />
        Sample events, just to show the colours. Your real timeline starts empty.
      </div>
    </div>
  );
}

export function TimelineStep({
  draft,
  dispatch,
  onContinue,
}: {
  draft: Draft;
  dispatch: React.Dispatch<FlowAction>;
  onContinue: () => void;
}) {
  const [adding, setAdding] = useState("");
  const [holding, setHolding] = useState<string | null>(null);
  const [dim, setDim] = useState(false);
  const [palFor, setPalFor] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; on: boolean }>({ text: "", on: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = draftEventTypes(draft);
  const drawn = rows.map((r, i) => entryFor(draft, r, i));
  const entries = drawn.filter(e => e.row.active);
  // Ticked tiles first, so the unticked ones read as "more you could add".
  const all = [...entries, ...drawn.filter(e => !e.row.active)];
  // Something is always in hand: the founder's pick, else a lively default.
  const held =
    entries.find(e => e.row.slug === holding) ?? entries.find(e => e.row.slug === "party") ?? entries[1] ?? entries[0] ?? null;
  const pageLabel = (wf: string | null) => pageRows(draft).find(p => p.id === wf)?.label ?? wf ?? "";
  const customs = rows.filter(r => !r.builtin).length;
  const canAdd = customs < MAX_DRAFT_EVENT_TYPES;
  const orgName = draft.name.trim() || "your org";

  // Offered again once unticked: this kind's starters, then its usual extras.
  // Matched on slug as well as label, so a renamed starter isn't offered back.
  const kebab = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const have = new Set(rows.flatMap(r => [r.slug, kebab(r.label)]));
  const ideas = canAdd
    ? [...new Set([...starterEventTypes(draft.kind).map(s => s.label), ...EVENT_TYPE_SUGGESTIONS[draft.kind ?? "other"]])]
        .filter(label => !have.has(kebab(label)))
        .slice(0, 5)
    : [];

  useEffect(() => {
    if (!palFor) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.(".pal, .sw")) setPalFor(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [palFor]);

  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  function say(text: string) {
    setToast({ text, on: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, on: false })), 2800);
  }

  function hold(slug: string) {
    if (rows.some(r => r.slug === slug && r.active)) setHolding(slug);
  }

  function toggle(r: DraftEventTypeRow) {
    setPalFor(null);
    if (!r.active) {
      // Off only ever means "its page is off" — ticking brings the page along.
      dispatch({ type: "togglePage", workflow: r.workflowId as WorkflowId });
      setHolding(r.slug);
      say(`${r.label} is on — the ${pageLabel(r.workflowId)} page joins your sidebar`);
    } else if (r.builtin) {
      dispatch({ type: "togglePage", workflow: r.workflowId as WorkflowId });
      say(`${r.label} is off — the ${pageLabel(r.workflowId)} page goes with it`);
    } else {
      dispatch({ type: "removeEventType", slug: r.slug });
    }
  }

  function add(raw: string) {
    const label = raw.trim();
    if (!label || !canAdd) return;
    const c = nextEventTypeColor(rows);
    dispatch({ type: "addEventType", label, color: c.color, colorDark: c.colorDark });
    setAdding("");
  }

  return (
    <div className="split tl">
      <div className="ask">
        <p className="kick">
          Step 4 · Event categories{" "}
          <span className="chip">
            {entries.length} {entries.length === 1 ? "category" : "categories"}
          </span>
        </p>
        <h1 className="q q--sm">
          Everything {orgName} does, <span className="hi hi--multi">colour-coded</span>.
        </h1>
        <p className="lede">
          From what you told us, these are your <b>event categories</b>. Every event you add later goes into one, and its
          colour is how everyone spots it.
        </p>

        <p className="how">
          <span className="num">1</span>Keep the ones you&apos;ll use, add any we missed
        </p>
        <div className="kinds" role="group" aria-label="Event categories" onMouseLeave={() => setDim(false)}>
          {all.map(e => {
            const r = e.row;
            return (
              <div
                key={r.slug}
                className={`kd tc${dim && e === held ? " lit" : ""}`}
                style={tone(r)}
                role="checkbox"
                tabIndex={0}
                aria-checked={r.active}
                aria-label={r.label}
                onClick={() => toggle(r)}
                onKeyDown={ev => {
                  if (ev.target === ev.currentTarget && (ev.key === " " || ev.key === "Enter")) {
                    ev.preventDefault();
                    toggle(r);
                  }
                }}
                onMouseEnter={() => {
                  hold(r.slug);
                  setDim(r.active);
                }}
                onFocus={() => hold(r.slug)}
              >
                {r.active ? (
                  <button
                    type="button"
                    className="sw"
                    aria-label={`Change colour of ${r.label}`}
                    aria-expanded={palFor === r.slug}
                    onClick={ev => {
                      ev.stopPropagation();
                      setPalFor(palFor === r.slug ? null : r.slug);
                    }}
                  >
                    <Ic name={e.icon} />
                  </button>
                ) : (
                  <span className="sw">
                    <Ic name={e.icon} />
                  </span>
                )}
                <div className="kd-t">
                  {r.active ? (
                    <LabelInput value={r.label} onCommit={label => dispatch({ type: "renameEventType", slug: r.slug, label })} />
                  ) : (
                    <b>{r.label}</b>
                  )}
                  <small>
                    {!r.active ? (
                      <>
                        also adds the <b>{pageLabel(r.workflowId)}</b> page
                      </>
                    ) : e.example ? (
                      <>
                        e.g. <b>{e.title}</b>
                      </>
                    ) : (
                      "your own category"
                    )}
                  </small>
                </div>
                <span className="bx">
                  <Ic name="check" />
                </span>
                {palFor === r.slug && (
                  <div className="pal" role="group" aria-label="Colour" onClick={ev => ev.stopPropagation()}>
                    {EVENT_TYPE_PALETTE.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="tc"
                        style={tone(c)}
                        aria-label={c.label}
                        aria-pressed={c.color.toLowerCase() === r.color.toLowerCase()}
                        onClick={() => {
                          dispatch({ type: "recolorEventType", slug: r.slug, color: c.color, colorDark: c.colorDark });
                          setPalFor(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {canAdd && (
            <form
              className="kd own"
              onSubmit={e => {
                e.preventDefault();
                add(adding);
              }}
            >
              <span className="sw">
                <Ic name="plus" />
              </span>
              <input
                placeholder="Add your own…"
                aria-label="Your own category"
                autoComplete="off"
                value={adding}
                maxLength={40}
                onChange={e => setAdding(e.target.value)}
              />
              <button className="mini" type="submit" disabled={!adding.trim()}>
                Add
              </button>
            </form>
          )}
        </div>

        {ideas.length > 0 && (
          <div className="ideas">
            <span>Others often add</span>
            {ideas.map(label => (
              <button key={label} type="button" className="idea" onClick={() => add(label)}>
                <Ic name="plus" />
                {label}
              </button>
            ))}
          </div>
        )}

        <p className="tips">
          <span>
            <Ic name="pencil" />
            Tap a name to rename it
          </span>
          <span>
            <i />
            Tap its sticker to change the colour
          </span>
        </p>

        <div className="foot">
          <button type="button" className="btn btn--lg" onClick={onContinue}>
            See the whole charter
            <Ic name="arrow-r" />
          </button>
          <span className="note">Nothing here is final — change it any time in Settings.</span>
        </div>
      </div>

      <div className="slot">
        <p className="how">
          <span className="num">2</span>Later, when you add an event, you pick its category
        </p>
        <NewEventCard entries={entries} held={held} onHold={hold} />
        <p className="how">
          <span className="num">3</span>It lands on the timeline in that colour
        </p>
        <Week draft={draft} entries={entries} held={held} dim={dim} onHold={hold} />
      </div>

      <div className={`tl-toast${toast.on ? " on" : ""}`} role="status">
        <Ic name="check" />
        <span>{toast.text}</span>
      </div>
    </div>
  );
}
