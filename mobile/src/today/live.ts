/**
 * The live window as the phone should show it *right now*. The server answers with
 * `msRemaining` at the moment it was asked; between polls the phone counts down from
 * there itself, so "closing soon" and the closing clock move every second without a
 * request, and an expired window reads closed before the next poll confirms it.
 */
import type { LiveCheckIn } from "@/lib/api-types";
import { useEffect, useState } from "react";
import type { CheckInWindow } from "~/moments/CheckInTicket";
import { clockLabel, dayStart, mmss } from "./time";

/** Same as lib/checkin.ts CHECKIN_CLOSING_MS: the last five minutes read "closing soon". */
const CLOSING_MS = 5 * 60_000;

export interface WindowView {
  win: CheckInWindow;
  msLeft: number;
  /** "Closes in 4:12" while closing. */
  closingLabel: string | null;
}

export function windowView(live: LiveCheckIn, fetchedAt: number, now: number): WindowView {
  if (live.cancelledAt) return { win: "void", msLeft: 0, closingLabel: null };
  if (live.state === "closed" || live.closedAt) return { win: "closed", msLeft: 0, closingLabel: null };
  const msLeft = live.msRemaining - (now - fetchedAt);
  if (msLeft <= 0) return { win: "closed", msLeft: 0, closingLabel: null };
  if (msLeft <= CLOSING_MS) return { win: "closing", msLeft, closingLabel: `Closes in ${mmss(msLeft)}` };
  return { win: "open", msLeft, closingLabel: null };
}

/** Same as the server's CLOSED_LINGER_MS: a finished window keeps its tally this long. */
const LINGER_MS = 10 * 60_000;

/**
 * Whether the band should still show. The server stops sending a finished window after
 * ten minutes; this applies the same rule to a copy restored from the persisted cache
 * (offline, or the first frame of a cold start), so yesterday's meeting never shows.
 */
export function bandVisible(live: LiveCheckIn, fetchedAt: number, now: number): boolean {
  const { win } = windowView(live, fetchedAt, now);
  if (win === "open" || win === "closing") return true;
  const end = live.closedAt ? Date.parse(live.closedAt) : fetchedAt + live.msRemaining;
  return now - end < LINGER_MS;
}

/** "Closed by Maya Rivera at 9:14 PM", or the cancel's equivalent. */
export function endedLine(live: LiveCheckIn): string | null {
  const at = live.closedAt ? new Date(live.closedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  if (live.cancelledAt) {
    const n = live.presentCount;
    return `${live.closedByName ?? "An officer"} cancelled it${at ? ` at ${at}` : ""}. ${n === 1 ? "1 check-in was" : `${n} check-ins were`} thrown out.`;
  }
  if (!live.closedAt) return null;
  return `Closed by ${live.closedByName ?? "the timer"}${at ? ` at ${at}` : ""}. ${live.presentCount} of ${live.eligibleCount} made it.`;
}

/** Date block + meta line for the ticket. */
export function ticketFace(live: LiveCheckIn) {
  const d = dayStart(live.event.date);
  return {
    dow: d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
    day: String(d.getDate()),
    meta: [clockLabel(live.event.time), live.event.location].filter((x): x is string => !!x),
  };
}

/** A clock that re-renders on each second (or minute) boundary while `on`. */
export function useNow(on: boolean, everySecond = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const step = everySecond ? 1000 : 60_000;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      t = setTimeout(tick, step - (Date.now() % step) + 5);
    };
    t = setTimeout(tick, step - (Date.now() % step) + 5);
    setNow(Date.now());
    return () => clearTimeout(t);
  }, [on, everySecond]);
  return now;
}
