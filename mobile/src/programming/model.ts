/**
 * Programming's rules, ported from lib/programming.ts and the web page's eventsCopy
 * (mobile/ can't import server runtime). Same gates the server enforces, so the phone
 * offers the step that unblocks a move instead of a refusal:
 *
 *   idea       title + type
 *   planning   + an owner (a person or a role)
 *   confirmed  + date + location: published to the chapter's Timeline
 *   done       only from confirmed, through the wrap-up
 *
 * A published event (confirmed/done) keeps its title, date, time, place, type,
 * attendance and collab frozen; owner and the wrap-up stay editable.
 */
import type { CalEventType, MeResponse, ProgrammingEvent, ProgrammingOwner, ProgrammingStage } from "@/lib/api-types";
import type { Tone } from "~/theme/palette";
import { daysFrom } from "~/today/time";

export const STAGES: readonly ProgrammingStage[] = ["idea", "planning", "confirmed", "done"];

export const STAGE: Record<ProgrammingStage, { label: string; meaning: string; tone: Tone }> = {
  idea:      { label: "Idea",      meaning: "Up in the air. Belongs to the chapter.",       tone: "butter" },
  planning:  { label: "Planning",  meaning: "Someone's on it. Belongs to a person.",         tone: "peach" },
  confirmed: { label: "Confirmed", meaning: "Locked in. The chapter can plan around it.",    tone: "sky" },
  done:      { label: "Done",      meaning: "Over. Rated and on the record.",                tone: "mint" },
};

export const RATING: Record<number, string> = { 1: "Rough", 2: "Okay", 3: "Good", 4: "Great", 5: "Legendary" };

const MANAGE_EVENTS = 1 << 2;
export const canManage = (me: MeResponse) => me.isAdmin || (me.permissions & MANAGE_EVENTS) !== 0;

export const isPublished = (s: ProgrammingStage) => s === "confirmed" || s === "done";

/* ── gates ─────────────────────────────────────────────────────────────────────── */

export type FieldKey = "owner" | "date" | "location";

export const FIELD: Record<FieldKey, { label: string; hint: string }> = {
  owner:    { label: "Owner",    hint: "One person or one role accountable. An idea belongs to the chapter; a plan belongs to somebody." },
  date:     { label: "Date",     hint: "Confirming puts this on everyone's calendar, so it needs a day people can plan around." },
  location: { label: "Location", hint: "Where it happens. \"TBD\" is not a location; that's what Planning is for." },
};

const has = (e: Pick<ProgrammingEvent, "owner" | "dueDate" | "location">, k: FieldKey) =>
  k === "owner" ? !!e.owner : k === "date" ? !!e.dueDate : !!e.location.trim();

/** What `e` still needs to sit in `stage` (title and type are always present on a saved event). */
export function missingFor(e: Pick<ProgrammingEvent, "owner" | "dueDate" | "location">, stage: ProgrammingStage): FieldKey[] {
  const need: FieldKey[] = stage === "idea" ? [] : stage === "planning" ? ["owner"] : ["owner", "date", "location"];
  return need.filter(k => !has(e, k));
}

export const needsConfirmFirst = (e: ProgrammingEvent, stage: ProgrammingStage) => stage === "done" && e.stage !== "confirmed";
export const isForward = (from: ProgrammingStage, to: ProgrammingStage) => STAGES.indexOf(to) > STAGES.indexOf(from);

/** A confirmed event whose last day is behind today: it happened and nobody wrapped it up. */
export function needsWrapUp(e: ProgrammingEvent, today: string): boolean {
  if (e.stage !== "confirmed") return false;
  if (e.schedule?.kind === "allDay") return e.schedule.end <= today;
  return e.dueDate != null && e.dueDate < today;
}

/** Ready to confirm: a plan with nothing left to collect. */
export const readyToConfirm = (e: ProgrammingEvent) => e.stage === "planning" && missingFor(e, "confirmed").length === 0;

/** The one line a card says about what's next, or null when it's settled. */
export function blocker(e: ProgrammingEvent, today: string): { text: string; tone: "rose" | "butter" } | null {
  if (needsWrapUp(e, today)) return { text: "Happened: wrap it up", tone: "rose" };
  if (isPublished(e.stage)) return null;
  const urgent = e.dueDate != null && e.dueDate >= today && daysFrom(today, e.dueDate) <= 14;
  const tone = urgent ? "rose" : "butter";
  if (e.stage === "idea") return e.owner ? null : { text: "No one on it", tone };
  const miss = missingFor(e, "confirmed");
  if (!miss.length) return { text: "Ready to confirm", tone: "butter" };
  return { text: `Needs ${miss.map(k => FIELD[k].label.toLowerCase()).join(" + ")}`, tone };
}

/* ── the page's derivations ────────────────────────────────────────────────────── */

export function onDeck(list: ProgrammingEvent[], today: string): ProgrammingEvent | null {
  return list.filter(e => e.stage !== "done" && e.dueDate != null && e.dueDate >= today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0] ?? null;
}

export interface Stats { slate: number; next14: number; next14Unready: number; unowned: number; avg: number | null; rated: number }

export function stats(list: ProgrammingEvent[], today: string): Stats {
  const live = list.filter(e => e.stage !== "done");
  const win = live.filter(e => e.dueDate != null && e.dueDate >= today && daysFrom(today, e.dueDate) <= 14);
  const rated = list.filter(e => e.stage === "done" && e.successRating != null);
  return {
    slate: live.length,
    next14: win.length,
    next14Unready: win.filter(e => !e.owner || !e.location.trim() || !e.dueDate).length,
    unowned: list.filter(e => e.stage === "idea" && !e.owner).length,
    avg: rated.length ? rated.reduce((n, e) => n + (e.successRating ?? 0), 0) / rated.length : null,
    rated: rated.length,
  };
}

export interface Clause { text: string; kind: "wrap" | "ready" | "unowned" }

/** The status line: what's next, then the counts you can go and change (eventsCopy statusBits). */
export function statusLine(list: ProgrammingEvent[], today: string, officer: boolean) {
  const next = onDeck(list, today);
  const wrap = officer ? list.filter(e => needsWrapUp(e, today)).length : 0;
  const ready = list.filter(readyToConfirm).length;
  const unowned = list.filter(e => e.stage === "idea" && !e.owner).length;
  const bits: Clause[] = [];
  if (wrap) bits.push({ text: `${wrap} already happened and ${wrap === 1 ? "needs" : "need"} wrapping up.`, kind: "wrap" });
  if (ready) bits.push({ text: `${ready} ready to confirm.`, kind: "ready" });
  if (unowned) bits.push({ text: `${unowned} idea${unowned === 1 ? "" : "s"} with no one on ${unowned === 1 ? "it" : "them"}.`, kind: "unowned" });
  return { lead: next ? { title: next.title, when: whenWord(next.dueDate!, today) } : null, bits };
}

function whenWord(date: string, today: string): string {
  const d = daysFrom(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 7) return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
  return shortDate(date);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** A card's compact when: Today / Tomorrow / "Thu · 5d" / a date / No date yet. */
export function cardWhen(date: string | null, today: string): { label: string; soon: boolean } {
  if (!date) return { label: "No date yet", soon: false };
  if (date < today) return { label: shortDate(date), soon: false };
  const d = daysFrom(today, date);
  if (d === 0) return { label: "Today", soon: true };
  if (d === 1) return { label: "Tomorrow", soon: true };
  if (d <= 7) return { label: `${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })} · ${d}d`, soon: true };
  return { label: shortDate(date), soon: false };
}

export function ownerLabel(o: ProgrammingOwner, long = false): string | null {
  if (!o) return null;
  if (o.kind === "brother") return o.name;
  if (!long || !o.holders.length) return o.name;
  return `${o.name} (${o.holders.map(n => n.split(/\s+/)[0]).join(" / ")})`;
}

/** The org's types programming manages: everything creatable; hidden ones can't take new events. */
export function managedTypes(types: CalEventType[] | undefined, workflows: string[]): CalEventType[] {
  return (types ?? []).filter(t => t.creatable && !t.hidden && (!t.workflowId || workflows.includes(t.workflowId)))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Paper's empty board: a few ideas keyed by the words the org's own types use. */
const STARTERS: { match: RegExp; titles: string[] }[] = [
  { match: /social|mixer|party/i, titles: ["Alumni mixer", "Game night"] },
  { match: /fund|philanthrop|charity/i, titles: ["Bake sale", "Charity 5K"] },
  { match: /service|volunteer|community/i, titles: ["Food bank shift", "Beach cleanup"] },
  { match: /program|professional|career|academic|educ/i, titles: ["Speaker night", "Study hall"] },
  { match: /rush|recruit/i, titles: ["Rush info night"] },
  { match: /brotherhood|sisterhood|bond|retreat/i, titles: ["Camping trip"] },
];

export function starterIdeas(types: CalEventType[]): { title: string; category: string }[] {
  const out: { title: string; category: string }[] = [];
  for (const t of types) {
    const hit = STARTERS.find(s => s.match.test(t.slug) || s.match.test(t.label));
    for (const title of hit?.titles ?? []) out.push({ title, category: t.slug });
  }
  return out.slice(0, 6);
}

export const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
