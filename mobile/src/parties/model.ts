/**
 * Parties' rules, ported from app/org/[slug]/parties/page.tsx (mobile/ can't import web
 * runtime). The page answers three questions, top to bottom:
 *
 *   What needs me?    the oldest party that happened but has no figures: Close it out
 *   Did we net money? net over closed parties, door, spent + kept %, avg member roll,
 *                     best night, and the night-by-night strip
 *   What happened?    every party, newest first
 *
 * A party is "due" once its date has passed and it isn't completed; "upcoming" while
 * it's today or later and open. Writes are MANAGE_PARTIES (1<<3), what the routes check.
 */
import type { MeResponse, Party, PartyRollRow } from "@/lib/api-types";
import { wallOf } from "~/meetings/model";
import { clockLabel, daysFrom, dayStart } from "~/today/time";

const MANAGE_PARTIES = 1 << 3;
export const canManage = (me: MeResponse) => me.isAdmin || (me.permissions & MANAGE_PARTIES) !== 0;

export const profit = (p: Party) => p.doorRevenue - p.expenses;
export const needsWrapUp = (p: Party, today: string) => !p.completed && p.date < today;
export const isUpcoming = (p: Party, today: string) => !p.completed && p.date >= today;

/** "Open · All White · with KDF": only the parts that exist. */
export const subLine = (p: Party) => [p.partyType, p.theme, p.collabOrg ? `with ${p.collabOrg}` : ""].filter(Boolean).join(" · ");

/** "9:00 PM" from the linked calendar entry, else its legacy free text. */
export function partyTime(p: Party): string {
  const s = p.schedule;
  if (s?.kind === "timed") {
    const w = wallOf(s.start, s.timeZone);
    if (w) return clockLabel(`${String(Math.floor(w.minutes / 60)).padStart(2, "0")}:${String(w.minutes % 60).padStart(2, "0")}`) ?? "";
  }
  return clockLabel(p.time) ?? "";
}

export const dow = (date: string) => dayStart(date).toLocaleDateString("en-US", { weekday: "short" });
export const monDay = (date: string) => dayStart(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const mon = (date: string) => dayStart(date).toLocaleDateString("en-US", { month: "short" });
export const longDate = (date: string) => dayStart(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/** "+$1,240" / "−$80", whole dollars. */
export const signed = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
/** "$1,240.00": the receipt's figures. */
export const cash = (n: number) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function upcomingLabel(date: string, today: string) {
  const n = daysFrom(today, date);
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : n <= 7 ? `In ${n} days` : "Upcoming";
}

/** The seal on the wrap-up envelope: the org's initials. */
export const orgInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join("").toUpperCase();

export const PARTY_TYPES: readonly { v: "Open" | "Closed"; blurb: string }[] = [
  { v: "Open", blurb: "Anyone with a wristband. Door money counts." },
  { v: "Closed", blurb: "Members and their plus-ones." },
];

/** Newest first; same day, newest added first. */
export const newestFirst = (l: Party[]) => l.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

/** Past and still open, most overdue first: the hero is the first. */
export const waiting = (l: Party[], today: string) => l.filter(p => needsWrapUp(p, today)).sort((a, b) => a.date.localeCompare(b.date));

export interface Takings {
  closed: Party[];
  door: number;
  spent: number;
  net: number;
  keptPct: number;
  best: Party | null;
  /** Average member roll over rolled parties, %; null before any roll. */
  avg: number | null;
  rolled: number;
  /** Closed parties oldest → newest, for the strip. */
  chron: Party[];
  maxSwing: number;
}

export function takings(l: Party[], rolls: Map<number, PartyRollRow>): Takings {
  const closed = l.filter(p => p.completed);
  const door = closed.reduce((s, p) => s + p.doorRevenue, 0);
  const spent = closed.reduce((s, p) => s + p.expenses, 0);
  const net = door - spent;
  const best = closed.length ? closed.reduce((a, b) => (profit(b) > profit(a) ? b : a)) : null;
  const r = [...rolls.values()].filter(x => x.eligible > 0);
  const avg = r.length ? Math.round((r.reduce((s, x) => s + x.present / x.eligible, 0) / r.length) * 100) : null;
  const chron = closed.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  return {
    closed, door, spent, net, keptPct: door > 0 ? Math.round((net / door) * 100) : 0, best, avg, rolled: r.length,
    chron, maxSwing: Math.max(1, ...chron.map(p => Math.abs(profit(p)))),
  };
}

/** The briefing under the title, as the web writes it. */
export function briefing(closed: number, net: number, wait: number): { lead: string; strong: string | null; rest: string } {
  const lead = closed > 0 ? `${closed} ${closed === 1 ? "party" : "parties"} closed out and the books are ` : "No parties closed out yet.";
  const strong = closed > 0 ? (net >= 0 ? "net positive" : "in the red") : null;
  const rest = (closed > 0 ? "." : "") + (wait > 0
    ? ` ${wait} ${wait === 1 ? "party is" : "parties are"} still waiting on numbers. Close ${wait === 1 ? "it" : "them"} out and you're square.`
    : " Everything's accounted for.");
  return { lead, strong, rest };
}
