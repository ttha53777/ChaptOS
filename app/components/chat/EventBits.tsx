"use client";

// Event rows and event peek cards share these: Tasks' tear-off date stub where
// a flag used to be, and one seat per person for the turnout (present ·
// excused · absent, in the colours the attendance screens use). Everything
// drawn here is server-attested (AnswerRow.event / PeekCard.turnout, from real
// reads); the model's own text is never parsed into it.

import type { AnswerRowTurnout } from "./types";

const PIPS_MAX = 30;

function localDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export type EventState = "logged" | "unlogged" | "upcoming" | "dated";

/** Upcoming beats everything; otherwise what was read: counts, all zeros, or nothing read. */
export function eventState(date: string, turnout: AnswerRowTurnout | null | undefined): EventState {
  if (date > todayIso()) return "upcoming";
  if (!turnout) return "dated";
  return turnout.attended + turnout.absent + turnout.excused > 0 ? "logged" : "unlogged";
}

/** No date yet (the card is still loading): the same stub, blank, so a flag never stands in. */
export function EventStub({ date, state }: { date?: string; state?: EventState }) {
  if (!date) {
    return (
      <span className="ev-stub pending" aria-hidden="true">
        <span className="mon">&nbsp;</span>
        <span className="dnum"><i /></span>
        <span className="dow"><i /></span>
      </span>
    );
  }
  const d = localDay(date);
  return (
    <span className={`ev-stub ${state ?? "dated"}`} aria-hidden="true">
      <span className="mon">{d.toLocaleString("en-US", { month: "short" })}</span>
      <span className="dnum">{d.getDate()}</span>
      <span className="dow">{d.toLocaleString("en-US", { weekday: "short" })}</span>
    </span>
  );
}

export function TurnoutStrip({ t, size }: { t: AnswerRowTurnout; size?: "lg" }) {
  const counted = t.attended + t.absent;
  const pct = counted > 0 ? Math.round((t.attended / counted) * 100) : null;
  const total = t.attended + t.excused + t.absent;
  const label = `${t.attended} attended, ${t.absent} absent${t.excused ? `, ${t.excused} excused` : ""}`;
  const parts: Array<[keyof AnswerRowTurnout, string]> = [["attended", "in"], ["excused", "ex"], ["absent", "out"]];
  return (
    <span className={`ev-turn${size ? ` ${size}` : ""}`} role="img" aria-label={label}>
      {total <= PIPS_MAX ? (
        <span className="pips">
          {parts.flatMap(([k, cls]) => Array.from({ length: t[k] }, (_, i) => <i key={`${k}${i}`} className={cls} />))}
        </span>
      ) : (
        <span className="bar">
          {parts.map(([k, cls]) => t[k] > 0 && <i key={k} className={cls} style={{ flexGrow: t[k] }} />)}
        </span>
      )}
      <span className="cap">
        {pct != null && <b>{pct}%</b>}
        {t.absent > 0 ? <span className="out">{t.absent} absent</span> : <span className="in">none absent</span>}
        {t.excused > 0 && <span>{t.excused} excused</span>}
      </span>
    </span>
  );
}

/** "Chapter Meeting 11/10" next to an Nov 10 stub says the date twice. */
export function titleWithoutDate(title: string): string {
  return title
    .replace(/\s*[-–—·,]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?)\s*$/i, "")
    .trim() || title;
}

