"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { todayISO } from "@/lib/dates";
import { IcTick } from "../icons";
import { Affordance, RowButton, addDays, catVars, dayNum, daysBetween, dowShort, fmtDay, iv, monShort, type RowHandlers } from "./common";
import { rowAction, type AnswerRow, type WeekItem, type WeekShape } from "../types";
import "./week.css";

// ─── Week ───────────────────────────────────────────────────────────────────
// The paper week (_design/Ask Chapt Paper.html, "This week"): a day strip with a
// dot per thing on it, one ticket for what's next, then a dated rail of the
// whole week. "Next" and its countdown are worked out here from the clock,
// never sent, so an answer reopened from storage tomorrow still points at the
// right thing. The rail lines up 1:1 with `rows`, so keyboard selection walks it.

/** "7:00 PM" / "19:00" → minutes past midnight; null for free text or no time. */
function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(time);
  if (!m) return null;
  let h = Number(m[1]) % 24;
  if (m[3]) { h = h % 12; if (m[3].toLowerCase() === "p") h += 12; }
  return h * 60 + Number(m[2] ?? 0);
}

/** Category colours for an event; a deadline carries none and draws peach. */
const itemVars = (it: WeekItem): CSSProperties => (it.cat && it.kind !== "deadline" ? catVars(it.cat.slug, it.cat.color, it.cat.colorDark) : {});

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Index of what's next: a timed thing still ahead today wins, else the first thing not yet past. */
function nextIndex(items: WeekItem[], today: string, nowMin: number): number {
  const ahead = (it: WeekItem) => {
    if (it.date !== today) return it.date > today;
    const m = minutesOf(it.time);
    return m == null || m > nowMin;
  };
  const timedToday = items.findIndex(it => it.date === today && minutesOf(it.time) != null && ahead(it));
  return timedToday >= 0 ? timedToday : items.findIndex(ahead);
}

/** The ticket's right edge: a clock countdown inside a day, a day count past it. */
function countdown(it: WeekItem, today: string, nowMin: number): { big: string; small?: string } {
  const days = daysBetween(today, it.date);
  const m = minutesOf(it.time);
  if (m != null) {
    const mins = days * 1440 + m - nowMin;
    if (mins > 0 && mins < 1440) {
      const h = Math.floor(mins / 60), r = mins % 60;
      return { big: h ? `${h}h${r ? ` ${r}m` : ""}` : `${r}m`, small: "from now" };
    }
  }
  if (days <= 0) return { big: "Today" };
  if (days === 1) return { big: "Tomorrow" };
  if (days < 14) return { big: `${days} days`, small: "from today" };
  return { big: `${Math.round(days / 7)} weeks`, small: "from today" };
}

/** "7:00 PM · Library 204" / "Deadline · yours". */
function factsOf(it: WeekItem): string {
  if (it.kind === "deadline") return [it.cat ? "Deadline" : "Task", it.time, it.mine ? "yours" : null].filter(Boolean).join(" · ");
  return [it.time ?? "All day", it.place ?? it.cat?.label].filter(Boolean).join(" · ");
}

function Tags({ it, past }: { it: WeekItem; past: boolean }) {
  const went = past && it.attended === true;
  if (!went && !(it.mine && it.kind !== "deadline") && !it.mandatory) return null;
  return (
    <span className="tg">
      {went && <span className="wk-pill went"><IcTick size={10} />You were there</span>}
      {it.mine && it.kind !== "deadline" && <span className="wk-pill mine">Yours</span>}
      {it.mandatory && !went && <span className="wk-stamp">Mandatory</span>}
    </span>
  );
}

function Ticket({ it, kicker, cd, ghost, onOpen }: {
  it: WeekItem;
  kicker: string;
  cd: { big: string; small?: string };
  ghost?: boolean;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      className={`wk-ticket${ghost ? " ghost" : ""}${it.kind === "deadline" ? " due" : ""}`}
      style={itemVars(it)}
      disabled={!onOpen}
      onClick={onOpen}
    >
      <span className="tstub">
        <small>{monShort(it.date)}</small>
        <b>{dayNum(it.date)}</b>
        <small>{dowShort(it.date)}</small>
      </span>
      <span className="tb">
        <span className="k-cap">
          {kicker}
          {it.mandatory && !ghost && <span className="wk-stamp">Mandatory</span>}
        </span>
        <span className="ttl">{it.title}</span>
        <span className="facts">{factsOf(it)}</span>
      </span>
      <span className="cd"><b>{cd.big}</b>{cd.small && <small>{cd.small}</small>}</span>
    </button>
  );
}

export function WeekSheet({ shape, rows, h }: { shape: WeekShape; rows: AnswerRow[]; h: RowHandlers }) {
  const now = useNow();
  const today = todayISO(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const days = Array.from({ length: 7 }, (_, i) => addDays(shape.start, i));
  const end = days[6];
  const [picked, setPicked] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement | null>(null);

  const byDay = new Map<string, WeekItem[]>();
  for (const it of shape.items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);

  const next = nextIndex(shape.items, today, nowMin);
  const nextItem = next >= 0 ? shape.items[next] : null;
  const nextRow = next >= 0 ? rows[next] : undefined;
  const after = shape.after ?? null;

  const jump = (day: string) => {
    setPicked(day);
    const el = rail.current?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.closest<HTMLElement>(".wk-row");
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  };

  return (
    <div className="shp shp-wk in in-3">
      <div className="wk-strip">
        {days.map((day, k) => {
          const items = byDay.get(day) ?? [];
          const past = day < today;
          const cls = `wk-day${past ? " past" : ""}${day === today ? " today" : ""}${items.length ? "" : " quiet"}${picked === day ? " on" : ""}`;
          return (
            <button
              key={day}
              type="button"
              className={cls}
              style={{ ["--k" as string]: k } as CSSProperties}
              aria-label={`${dowShort(day)} ${fmtDay(day)}, ${items.length ? `${items.length} ${items.length === 1 ? "thing" : "things"}` : "nothing on"}`}
              aria-pressed={picked === day}
              onClick={() => jump(day)}
            >
              <small>{dowShort(day)}</small>
              <b>{dayNum(day)}</b>
              <span className="dots">
                {items.slice(0, 4).map((it, i) => <i key={i} className={it.kind === "deadline" ? "due" : ""} style={itemVars(it)} />)}
              </span>
            </button>
          );
        })}
      </div>

      {nextItem && (
        <Ticket
          it={nextItem}
          kicker={`Up next · ${nextItem.kind === "deadline" ? "deadline" : nextItem.cat?.label.toLowerCase() ?? "event"}`}
          cd={countdown(nextItem, today, nowMin)}
          onOpen={nextRow && rowAction(nextRow) ? () => h.act(nextRow) : undefined}
        />
      )}

      {shape.items.length === 0 && (
        <div className="wk-clear">
          <b>{today > end ? "Nothing was on" : "Clear all week"}</b>
          <span>No events on the calendar, and no open tasks due.</span>
        </div>
      )}

      {shape.items.length > 0 && (
        <div className="wk-rail" ref={rail}>
          {shape.items.map((it, i) => {
            const past = it.date < today;
            const firstOfDay = shape.items.findIndex(x => x.date === it.date) === i;
            return (
              <RowButton
                key={`${it.ref.type}-${it.ref.id}`}
                row={rows[i]}
                i={i}
                h={h}
                className={`wk-row${it.kind === "deadline" ? " due" : ""}${past ? " gone" : ""}${it.date === today ? " today" : ""}${i === next ? " up" : ""}`}
                style={{ ...itemVars(it), ...iv(i) }}
                label={`${it.title}, ${dowShort(it.date)} ${fmtDay(it.date)}, ${factsOf(it)}`}
              >
                <span className="dt" {...(firstOfDay ? { "data-day": it.date } : {})}>
                  {it.date === today ? "Today" : `${dowShort(it.date)} ${dayNum(it.date)}`}
                </span>
                <span className="cat" />
                <span className="m">
                  <b>{it.title}</b>
                  <small>{factsOf(it)}</small>
                </span>
                <Tags it={it} past={past} />
                <Affordance action={rows[i] ? rowAction(rows[i]) : null} />
              </RowButton>
            );
          })}
        </div>
      )}

      {after && today <= end && (
        <button
          type="button"
          className="wk-after"
          style={itemVars(after)}
          onClick={() => h.onPeek({ kind: "event", title: after.title, ref: after.ref })}
        >
          <span className="k-cap">After this week</span>
          <span className="cat" />
          <span className="m"><b>{after.title}</b><small>{dowShort(after.date)} {fmtDay(after.date)}{after.time ? ` · ${after.time}` : ""}</small></span>
        </button>
      )}
    </div>
  );
}
