"use client";

// Today line (_design/Ask Chapt List Forms Mock.html §02) — tasks and events on
// one rail in date order, a rule at today, and each row's distance from it.
// Groups are fixed (Before today, Today, Next 7 days, Later) and computed from
// the shape's own `today`. "Late" is never a group and never an event: it's an
// open task past its date, marked on its own row. Something that already
// happened is just earlier, and drawn quiet.

import { rowAction, type AnswerRow, type DatedShape } from "../types";
import { addDays, Affordance, DateStub, dowShort, dueLabel, fmtDay, iv, RowButton, type RowHandlers } from "./common";

type Group = "past" | "now" | "week" | "later";
const GROUP_LABEL: Record<Group, string> = { past: "Before today", now: "Today", week: "Next 7 days", later: "Later" };

function groupOf(date: string, today: string): Group {
  if (date < today) return "past";
  if (date === today) return "now";
  return date <= addDays(today, 7) ? "week" : "later";
}

export function DatedSheet({ shape, rows, h }: { shape: DatedShape; rows: AnswerRow[]; h: RowHandlers }) {
  const groups: Record<Group, number[]> = { past: [], now: [], week: [], later: [] };
  shape.items.forEach((it, i) => groups[groupOf(it.date, shape.today)].push(i));
  const ahead = groups.now.length + groups.week.length + groups.later.length > 0;
  let order = 0;

  const row = (i: number, g: Group) => {
    const it = shape.items[i];
    const r = rows[i];
    const was = it.done && !it.late;
    const tone = it.late ? "late" : was ? "was" : g === "now" ? "now" : g === "week" ? "week" : "plain";
    const d = it.kind === "task" && it.done ? "done" : dueLabel(shape.today, it.date, it.late);
    return (
      <RowButton
        key={i}
        row={r}
        i={i}
        h={h}
        className={`td-r${it.late ? " late" : ""}${was ? " was" : ""}`}
        style={iv(order++)}
        label={`${r?.title ?? ""}, ${fmtDay(it.date)}, ${d}`}
      >
        <DateStub date={it.date} tone={tone} />
        <span className="rb">
          <span className="t">{r?.title}</span>
          {r?.subtitle && <span className="s">{r.subtitle}</span>}
        </span>
        <span className="d">{d}</span>
        <Affordance action={r ? rowAction(r) : null} />
      </RowButton>
    );
  };

  const block = (g: Group) => {
    const idx = groups[g];
    if (idx.length === 0) return null;
    const late = idx.filter(i => shape.items[i].late).length;
    return (
      <div key={g} className={`td-g ${g}`}>
        {/* The Today rule is the "today" group's label. */}
        {g !== "now" && (
          <span className="td-l shp-kicker" style={iv(order)}>
            {GROUP_LABEL[g]} · {idx.length}{late > 0 && <> · <b>{late} late</b></>}
          </span>
        )}
        {idx.map(i => row(i, g))}
      </div>
    );
  };

  return (
    <div className="shp shp-td in in-3">
      {block("past")}
      {ahead && (
        <div className="td-now" style={iv(order)}>
          <span>Today · {dowShort(shape.today)} {fmtDay(shape.today)}</span>
        </div>
      )}
      {block("now")}
      {block("week")}
      {block("later")}
      {shape.truncated && <p className="shp-more">+ {shape.truncated.of - shape.items.length} more not shown</p>}
    </div>
  );
}
