"use client";

import type { CSSProperties } from "react";

import { todayISO } from "@/lib/dates";
import { addDays, catVars, type RowHandlers } from "./common";
import { rowAction, type AnswerRow, type WeekItem, type WeekShape } from "../types";

// ─── Week ───────────────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekSheet({ shape, rows, h }: { shape: WeekShape; rows: AnswerRow[]; h: RowHandlers }) {
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(shape.start, i));
  // Items keep their index so each block binds to its row (selection + action).
  const byDay = new Map<string, Array<{ it: WeekItem; i: number }>>();
  shape.items.forEach((it, i) => {
    const list = byDay.get(it.date) ?? [];
    list.push({ it, i });
    byDay.set(it.date, list);
  });
  let order = 0;
  return (
    <div className="shp shp-wk in in-3">
      {days.map(day => {
        const [y, m, d] = day.split("-").map(Number);
        const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
        const isToday = day === today;
        const items = byDay.get(day) ?? [];
        return (
          <div key={day} className={`wd${isToday ? " today" : ""}${day < today ? " past" : ""}`}>
            <div className="wd-h">
              <span className="dw">{dow}{isToday ? " · today" : ""}</span>
              <span className="dn">{d}</span>
            </div>
            <div className="wd-b">
              {items.length === 0 && <span className="wd-none">—</span>}
              {items.map(({ it, i }) => {
                const row = rows[i];
                return (
                  <button
                    key={`${it.ref.type}-${it.ref.id}`}
                    type="button"
                    className={`wk-ev${it.kind === "deadline" ? " dl" : ""}${i === h.selectedRow ? " sel" : ""}`}
                    style={{ ...(it.cat ? catVars(it.cat.slug, it.cat.color, it.cat.colorDark) : {}), ["--i" as string]: order++ } as CSSProperties}
                    disabled={!row || !rowAction(row)}
                    onClick={() => row && h.act(row)}
                  >
                    <b>{it.title}</b>
                    <span className="tm">{it.kind === "deadline" ? `⚑ ${it.time ?? "Due"}` : it.time ?? it.cat?.label ?? ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
