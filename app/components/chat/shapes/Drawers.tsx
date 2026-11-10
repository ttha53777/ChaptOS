"use client";

// By drawer (_design/Ask Chapt List Forms Mock.html §08) — when the rows really
// are different kinds of record, they stay a list, filed under a tab for the
// part of the app each one lives in, in sidebar order. Client-only: the grouping
// is the `ref.type` the server already attaches to each row.
//
// A drawer for a section the org has switched off is never drawn; its rows
// join the plain list underneath. Tasks and events together are calendar
// things, which the server draws on the Today line, so they never qualify here.

import type { CSSProperties } from "react";

import { NAV_LABELS } from "@/lib/nav-order";
import { useChapter } from "../../../context/ChapterContext";
import { KindGlyph } from "../icons";
import type { AnswerRow } from "../types";
import { iv, type RenderRow } from "./common";

interface DrawerDef {
  /** The sidebar label it sorts by. */
  nav: string;
  label: string;
  glyph: string;
  /** Paper pastel family. */
  hue: "rose" | "sky" | "butter" | "mint" | "lilac";
  /** The workflow that switches its section off; null = always on. */
  workflow: string | null;
}

// Keyed by ref type. "transaction" and "doc" refs arrive with the Treasury and
// Docs drawers; an unknown type has no drawer and its rows stay in the list.
const DRAWERS: Record<string, DrawerDef> = {
  member:      { nav: "Brotherhood", label: "Roster",   glyph: "roster",   hue: "rose",   workflow: "members" },
  event:       { nav: "Timeline",    label: "Timeline", glyph: "timeline", hue: "sky",    workflow: null },
  task:        { nav: "Tasks",       label: "Tasks",    glyph: "tasks",    hue: "butter", workflow: "tasks" },
  transaction: { nav: "Treasury",    label: "Treasury", glyph: "treasury", hue: "mint",   workflow: "finance" },
  doc:         { nav: "Docs",        label: "Docs",     glyph: "docs",     hue: "lilac",  workflow: "docs" },
};

const CALENDAR = new Set(["event", "task"]);

/** Every row has a ref, at least two kinds are present, and they aren't all calendar things. */
export function isDrawerRows(rows: AnswerRow[]): boolean {
  if (rows.length < 2 || !rows.every(r => r.ref)) return false;
  const types = new Set(rows.map(r => r.ref!.type as string));
  return types.size >= 2 && ![...types].every(t => CALENDAR.has(t));
}

export function DrawerBlock({ rows, renderRow }: { rows: AnswerRow[]; renderRow: RenderRow }) {
  const { currentUser } = useChapter();
  // Until /me resolves, every section counts as on — the sidebar does the same.
  const enabled = currentUser?.org?.enabledWorkflows;
  const open = (d: DrawerDef) => !d.workflow || !enabled || enabled.includes(d.workflow);

  const groups = new Map<string, Array<{ row: AnswerRow; i: number }>>();
  const loose: Array<{ row: AnswerRow; i: number }> = [];
  rows.forEach((row, i) => {
    const type = row.ref?.type as string | undefined;
    const def = type ? DRAWERS[type] : undefined;
    if (!def || !open(def)) { loose.push({ row, i }); return; }
    groups.set(type!, [...(groups.get(type!) ?? []), { row, i }]);
  });
  const order = (t: string) => {
    const at = NAV_LABELS.indexOf(DRAWERS[t].nav);
    return at < 0 ? NAV_LABELS.length : at;
  };
  const drawers = [...groups.keys()].sort((a, b) => order(a) - order(b));

  // One drawer is just a list with a tab on it.
  if (drawers.length < 2) return <div className="reslist in in-3">{rows.map(renderRow)}</div>;

  return (
    <div className="mx in in-3">
      {drawers.map((t, di) => {
        const def = DRAWERS[t];
        const items = groups.get(t)!;
        return (
          <div key={t} className={`dr hue-${def.hue}`} style={{ ...iv(di * 2) } as CSSProperties}>
            <span className="dr-tab"><KindGlyph kind={def.glyph} size={13} />{def.label}<i>{items.length}</i></span>
            <div className="dr-b reslist">{items.map(({ row, i }) => renderRow(row, i))}</div>
          </div>
        );
      })}
      {loose.length > 0 && <div className="reslist">{loose.map(({ row, i }) => renderRow(row, i))}</div>}
    </div>
  );
}
