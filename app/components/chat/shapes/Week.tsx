"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { todayISO } from "@/lib/dates";
import { IcClock, IcFlag, IcPin, IcTick } from "../icons";
import { Affordance, RowButton, Sheet, addDays, catVars, dayNum, daysBetween, dowShort, fmtDay, iv, monShort, type RowHandlers } from "./common";
import { rowAction, type AnswerRow, type WeekItem, type WeekShape } from "../types";
import "./week.css";

// ─── Week ───────────────────────────────────────────────────────────────────
// A planner page (_design/Ask Chapt Week Answer Mock.html): the week's outline
// as a strip, one ticket for what's next, then the days down a rail. "Next" and
// its countdown are worked out here from the clock, never sent, so an answer
// reopened from storage tomorrow still points at the right thing.

/** "7:00 PM" / "19:00" → minutes past midnight; null for free text or no time. */
function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(time);
  if (!m) return null;
  let h = Number(m[1]) % 24;
  if (m[3]) { h = h % 12; if (m[3].toLowerCase() === "p") h += 12; }
  return h * 60 + Number(m[2] ?? 0);
}

/** The strip's chip: "7p", "8:30a", "due". */
function chipLabel(it: WeekItem): string {
  if (it.kind === "deadline") return "due";
  const m = minutesOf(it.time);
  if (m == null) return it.time ? it.time.slice(0, 6) : "all day";
  const h = Math.floor(m / 60), min = m % 60;
  return `${h % 12 || 12}${min ? `:${String(min).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
}

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

/** "Tonight" / "Today" / "Tomorrow" / "Sat". */
function whenLabel(it: WeekItem, today: string): string {
  const n = daysBetween(today, it.date);
  if (n === 0) return (minutesOf(it.time) ?? 0) >= 17 * 60 ? "Tonight" : "Today";
  return n === 1 ? "Tomorrow" : dowShort(it.date);
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
  if (days < 14) return { big: `in ${days} days` };
  return { big: `in ${Math.round(days / 7)} weeks` };
}

function Tags({ it, past, next }: { it: WeekItem; past: boolean; next: boolean }) {
  return (
    <span className="tg">
      {past && it.attended === true && <span className="wkp-pill went"><IcTick size={10} />You were there</span>}
      {it.mine && <span className="wkp-pill mine">Yours</span>}
      {it.mandatory && !(past && it.attended === true) && <span className="wkp-stamp">Mandatory</span>}
      {next && <span className="wkp-pill">Up next</span>}
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
      className={`wkp-next${ghost ? " ghost" : ""}${it.kind === "deadline" ? " due" : ""}`}
      style={itemVars(it)}
      disabled={!onOpen}
      onClick={onOpen}
    >
      <span className="stub">
        <span className="dw">{dowShort(it.date)}</span>
        <span className="dn">{dayNum(it.date)}</span>
        <span className="mo">{monShort(it.date)}</span>
      </span>
      <span className="body">
        <span className="kick">
          {kicker}
          {it.mandatory && !ghost && <span className="wkp-stamp">Mandatory</span>}
        </span>
        <span className="ttl">{it.title}</span>
        <span className="facts">
          {it.kind === "deadline"
            ? <span><IcFlag size={13} /><span className="tm">Due</span></span>
            : it.time && <span><IcClock size={13} /><span className="tm">{it.time}</span></span>}
          {it.place && <span><IcPin size={13} />{it.place}</span>}
          {!it.place && it.cat && it.kind !== "deadline" && <span>{it.cat.label}</span>}
        </span>
      </span>
      <span className="cd"><b>{cd.big}</b>{cd.small && <span>{cd.small}</span>}</span>
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
  const agenda = useRef<HTMLOListElement | null>(null);

  // Items keep their index so each mark binds to its row (selection + action).
  const byDay = new Map<string, Array<{ it: WeekItem; i: number }>>();
  shape.items.forEach((it, i) => {
    const list = byDay.get(it.date) ?? [];
    list.push({ it, i });
    byDay.set(it.date, list);
  });

  const next = nextIndex(shape.items, today, nowMin);
  const nextItem = next >= 0 ? shape.items[next] : null;
  const nextRow = next >= 0 ? rows[next] : undefined;
  // One thing, and the ticket already says it: no list.
  const showAgenda = shape.items.length > 1 || (shape.items.length === 1 && !nextItem);
  const left = shape.items.filter(it => it.date >= today);
  const events = left.filter(it => it.kind === "event").length;
  const free = days.filter(d => d >= today && !byDay.has(d));
  const after = shape.after ?? null;

  const jump = (day: string) => {
    setPicked(day);
    const el = agenda.current?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  };

  let order = 0;
  return (
    <Sheet
      className="shp-wk"
      kicker={`${fmtDay(shape.start)} – ${monShort(shape.start) === monShort(end) ? dayNum(end) : fmtDay(end)}`}
      legend={shape.items.length > 1 && (
        <>
          {shape.items.some(it => it.mandatory) && <span><i className="k-mand" />Mandatory</span>}
          {shape.items.some(it => it.kind === "deadline") && <span><i className="k-due" />Due</span>}
          {free.length > 0 && <span><i className="k-free" />Free</span>}
        </>
      )}
    >
      <div className="wkp-strip">
        {days.map((day, k) => {
          const items = byDay.get(day) ?? [];
          const past = day < today;
          const cls = `wkp-d${past ? " past" : ""}${day === today ? " today" : ""}${!past && !items.length ? " open" : ""}${picked === day ? " on" : ""}`;
          return (
            <button
              key={day}
              type="button"
              className={cls}
              style={{ ["--k" as string]: k } as CSSProperties}
              aria-label={`${dowShort(day)} ${fmtDay(day)}, ${items.length ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "nothing on"}`}
              onClick={() => jump(day)}
            >
              <span className="dw">{dowShort(day)}</span>
              <span className="dn">{dayNum(day)}</span>
              <span className="pp">
                {items.map(({ it, i }) => (
                  <i key={i} className={`${it.kind === "deadline" ? "due" : ""}${it.mandatory ? " mand" : ""}`} style={itemVars(it)}><b>{chipLabel(it)}</b></i>
                ))}
                {!items.length && !past && <em>free</em>}
              </span>
            </button>
          );
        })}
      </div>

      {nextItem && (
        <Ticket
          it={nextItem}
          kicker={`Up next · ${whenLabel(nextItem, today)}`}
          cd={countdown(nextItem, today, nowMin)}
          onOpen={nextRow && rowAction(nextRow) ? () => h.act(nextRow) : undefined}
        />
      )}
      {shape.items.length === 0 && (
        <div className="wkp-clear">
          <b>{today > end ? "Nothing was on" : "Clear all week"}</b>
          <span>No events on the calendar, and no open tasks due.</span>
        </div>
      )}

      {showAgenda && (
        <ol className="wkp-ag" ref={agenda}>
          {days.map(day => {
            const items = byDay.get(day) ?? [];
            const past = day < today;
            return (
              <li key={day} data-day={day} className={`wkp-day${past ? " past" : ""}${day === today ? " today" : ""}`}>
                <div className="wkp-dl"><b>{dowShort(day)}</b><span>{day === today ? "Today" : fmtDay(day)}</span></div>
                <div className="wkp-its">
                  {items.length === 0 && <p className="wkp-free" style={iv(order++)}>{past ? "Nothing was on" : "Free"}</p>}
                  {items.map(({ it, i }) => (
                    <RowButton
                      key={`${it.ref.type}-${it.ref.id}`}
                      row={rows[i]}
                      i={i}
                      h={h}
                      className={`wkp-it${it.kind === "deadline" ? " due" : ""}${past ? " gone" : ""}`}
                      style={{ ...itemVars(it), ...iv(order++) }}
                    >
                      <span className="tm">{it.kind === "deadline" ? <><IcFlag size={12} />{it.time ?? "Due"}</> : it.time ?? "All day"}</span>
                      <i className="sp" />
                      <span className="bd">
                        <span className="t">{it.title}</span>
                        <span className="s">{it.kind === "deadline" ? (it.cat ? "Deadline" : "Task") : it.place ?? it.cat?.label ?? ""}</span>
                      </span>
                      <Tags it={it} past={past} next={i === next} />
                      <Affordance action={rows[i] ? rowAction(rows[i]) : null} />
                    </RowButton>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {after && today <= end && (
        <Ticket
          it={after}
          ghost
          kicker="After this week"
          cd={countdown(after, today, nowMin)}
          onOpen={() => h.onPeek({ kind: "event", title: after.title, ref: after.ref })}
        />
      )}

      <div className="wkp-foot">
        <span><b>{events}</b> {events === 1 ? "event" : "events"} left</span>
        <span><b>{left.length - events}</b> due</span>
        <span><b>{left.filter(it => it.mandatory).length}</b> mandatory</span>
        {today <= end && (
          <span className="free">
            Free: {free.length === 0 ? "no days" : free.length === 7 ? "all week" : free.length > 3 && daysBetween(free[0], free[free.length - 1]) === free.length - 1
              ? `${dowShort(free[0])} – ${dowShort(free[free.length - 1])}`
              : free.map(dowShort).join(" · ")}
          </span>
        )}
      </div>
    </Sheet>
  );
}
