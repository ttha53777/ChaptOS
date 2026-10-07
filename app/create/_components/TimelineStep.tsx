"use client";

/**
 * Step 4 — WHAT LANDS ON YOUR TIMELINE. The categories every dated thing gets
 * tagged with, as strips of washi tape: rename inline, tap the tape to change
 * its colour, add your own. Built-ins whose page is off wait in a ghosted
 * "waiting on a page" list with a one-tap way to turn that page on.
 *
 * Beside it, a sample week drawn with those categories — clearly labelled as
 * made-up entries; the real timeline starts empty.
 */

import { useEffect, useState } from "react";
import type { Draft } from "@/lib/onboarding/draft";
import { KIND_LABEL } from "@/lib/onboarding/kinds";
import { MAX_DRAFT_EVENT_TYPES, nextEventTypeColor, type DraftEventTypeRow } from "@/lib/onboarding/event-types";
import { EVENT_TYPE_PALETTE } from "@/lib/event-types";
import type { WorkflowId } from "@/lib/org-types";
import { draftEventTypes, draftVocab, type FlowAction } from "./flow-state";
import { Ic, fmtDay, pageRows } from "./paper";

const SAMPLE: Record<string, [day: number, title: string, at: string]> = {
  party: [4, "Fall formal", "9:00p"],
  deadline: [2, "Dues due", "all day"],
  service: [5, "Food bank shift", "10:00a"],
  social: [3, "Social night", "8:00p"],
  fundraiser: [1, "Bake sale", "noon"],
  programming: [3, "Alumni panel", "6:30p"],
  workshop: [1, "Résumé workshop", "5:00p"],
  game: [5, "Home game", "1:00p"],
  practice: [0, "Practice", "4:00p"],
  tournament: [6, "Invitational", "9:00a"],
  "service-project": [5, "Park cleanup", "9:00a"],
  outreach: [3, "Tabling", "11:00a"],
  induction: [4, "Induction", "7:00p"],
  performance: [4, "Showcase", "7:30p"],
  auditions: [0, "Auditions", "6:00p"],
};

function tapeStyle(t: { color: string; colorDark: string }) {
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

function Week({ draft, rows }: { draft: Draft; rows: DraftEventTypeRow[] }) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayIdx = (now.getDay() + 6) % 7;
  const meetings = draftVocab(draft, "Meetings");

  const buckets: { row: DraftEventTypeRow; title: string; at: string }[][] = days.map(() => []);
  rows.forEach((row, i) => {
    if (row.slug === "chapter") {
      const title = draft.kind === "team" ? "Practice" : /meeting/i.test(meetings) ? meetings : `${meetings} meeting`;
      buckets[6]!.push({ row, title, at: "7:00p" });
      return;
    }
    const s = SAMPLE[row.slug];
    buckets[s ? s[0] : (i * 2 + 1) % 7]!.push({ row, title: s ? s[1] : row.label, at: s ? s[2] : "7:00p" });
  });

  return (
    <div className="week">
      <div className="week-h">
        <span className="tile t-sky">
          <Ic name="timeline" />
        </span>
        <b>A week on your timeline</b>
        <small>
          {fmtDay(iso(days[0]!))} – {fmtDay(iso(days[6]!))}
        </small>
      </div>
      {days.map((d, i) => (
        <div key={i} className={`day${i === todayIdx ? " today" : ""}`}>
          <span className="d">
            {d.toLocaleDateString("en-US", { weekday: "short" })}
            <b>{d.getDate()}</b>
          </span>
          <div className="evs">
            {buckets[i]!.map(e => (
              <span key={e.row.slug} className="ev" style={tapeStyle(e.row)}>
                {e.title}
                <small>{e.row.label}</small>
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="week-f">A preview with made-up entries — your real timeline starts empty.</div>
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
  const rows = draftEventTypes(draft);
  const active = rows.filter(r => r.active);
  const ghosts = rows.filter(r => !r.active);
  const pageLabel = (wf: string | null) => pageRows(draft).find(p => p.id === wf)?.label ?? wf ?? "";
  const customs = rows.filter(r => !r.builtin).length;
  const canAdd = customs < MAX_DRAFT_EVENT_TYPES;

  function source(r: DraftEventTypeRow): string {
    if (r.builtin) return r.workflowId ? `comes with ${pageLabel(r.workflowId)}` : "always on";
    if (r.workflowId === "events") return `starter · ${KIND_LABEL[draft.kind ?? "other"].replace(/^an? /i, "")}`;
    return "yours";
  }

  function recolor(r: DraftEventTypeRow) {
    const i = EVENT_TYPE_PALETTE.findIndex(c => c.color.toLowerCase() === r.color.toLowerCase());
    const next = EVENT_TYPE_PALETTE[(i + 1) % EVENT_TYPE_PALETTE.length]!;
    dispatch({ type: "recolorEventType", slug: r.slug, color: next.color, colorDark: next.colorDark });
  }

  function add() {
    const label = adding.trim();
    if (!label || !canAdd) return;
    const c = nextEventTypeColor(rows);
    dispatch({ type: "addEventType", label, color: c.color, colorDark: c.colorDark });
    setAdding("");
  }

  return (
    <div className="split">
      <div className="ask">
        <p className="kick">
          Step 4 · Your timeline <span className="chip">{active.length} categories</span>
        </p>
        <h1 className="q q--sm">
          What lands on your{" "}
          <span className="hi" style={{ ["--mark" as string]: "var(--mint)" }}>
            timeline
          </span>
          ?
        </h1>
        <p className="lede">
          These are the kinds of things {draft.name.trim() || "your org"} puts on the calendar. Everything you add later gets
          tagged with one, so the week stays easy to read. Tap the tape to change its colour.
        </p>

        <div className="types">
          {active.map(r => (
            <div key={r.slug} className="ty">
              <button type="button" className="tape" style={tapeStyle(r)} aria-label={`Change colour of ${r.label}`} onClick={() => recolor(r)} />
              <div className="ty-l">
                <LabelInput value={r.label} onCommit={label => dispatch({ type: "renameEventType", slug: r.slug, label })} />
                <small>{source(r)}</small>
              </div>
              <div className="ty-r">
                {!r.builtin && (
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label={`Remove ${r.label}`}
                    onClick={() => dispatch({ type: "removeEventType", slug: r.slug })}
                  >
                    <Ic name="trash" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {ghosts.length > 0 && <p className="kick waiting">Waiting on a page</p>}
          {ghosts.map(r => (
            <div key={r.slug} className="ty ghost">
              <span className="tape" style={tapeStyle(r)} />
              <div className="ty-l">
                <b>{r.label}</b>
                <small>turns on with {pageLabel(r.workflowId)}</small>
              </div>
              <div className="ty-r">
                <button type="button" className="mini" onClick={() => dispatch({ type: "togglePage", workflow: r.workflowId as WorkflowId })}>
                  <Ic name="plus" />
                  Use {pageLabel(r.workflowId)}
                </button>
              </div>
            </div>
          ))}

          {canAdd && (
            <form
              className="ty-add"
              onSubmit={e => {
                e.preventDefault();
                add();
              }}
            >
              <Ic name="plus" />
              <input
                placeholder="Add a category — Rush, Philanthropy, Retreat…"
                aria-label="New category"
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
        <p className="ty-cap">
          {customs} of {MAX_DRAFT_EVENT_TYPES} of your own · more in Settings → Event types later
        </p>

        <div className="foot">
          <button type="button" className="btn btn--lg" onClick={onContinue}>
            See the whole charter
            <Ic name="arrow-r" />
          </button>
        </div>
      </div>
      <div className="slot">
        <Week draft={draft} rows={active} />
      </div>
    </div>
  );
}
