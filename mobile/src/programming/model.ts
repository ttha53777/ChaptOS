/**
 * Programming's rules and words come from lib/programme/board (shared with the web
 * events page: the same gates the server enforces, the same measures, the same
 * sentences). This file adds what only the app needs: who can manage, the type
 * colours, the owner labels, and the time text (lib/event-time needs Temporal, so
 * the app formats a schedule's time with its own zone-aware helper).
 *
 *   idea       title + type
 *   planning   + an owner (a person or a role)
 *   confirmed  + date + location: published to the chapter's Timeline
 *   done       only from confirmed, through the wrap-up
 */
import type { CalendarEvent, CalEventType, MeResponse, ProgrammingEvent, ProgrammingStage } from "@/lib/api-types";
import { fmtUsd } from "@/lib/money";
import type { Palette, Tone } from "~/theme/palette";
import { timeText } from "~/dash/UpNextCard";

export * from "@/lib/programme/board";
export { STAGES, STAGE_LABELS, STAGE_MEANINGS } from "@/lib/state/programming-stage";
export { initialsOf, ownerInitials, ownerLabel, ownerShortLabel } from "@/lib/event-owner";

const MANAGE_EVENTS = 1 << 2;
export const canManage = (me: MeResponse) => me.isAdmin || (me.permissions & MANAGE_EVENTS) !== 0;

/** The lane dots, as the web's --faint / --gold / --vio / --ok. */
export const STAGE_TONE: Record<ProgrammingStage, Tone | null> = { idea: null, planning: "butter", confirmed: "lilac", done: "mint" };

/** The types a new event or idea can take (the web's programmingFormOptions): creatable, shown, its workflow on. */
export function managedTypes(types: CalEventType[] | undefined, workflows: string[]): CalEventType[] {
  return (types ?? []).filter(t => t.creatable && !t.hidden && (!t.workflowId || workflows.includes(t.workflowId)))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/** The board's type chips (the web's typeFilters): creatable and shown, in display order. */
export function filterTypes(types: CalEventType[] | undefined): CalEventType[] {
  return (types ?? []).filter(t => t.creatable && !t.hidden).sort((a, b) => a.displayOrder - b.displayOrder);
}

/** "6:30 PM", "7:00 – 9:00 PM", or null (all day / no time): lib/event-time formatEventTime. */
export const eventTime = (e: Pick<ProgrammingEvent, "schedule" | "time">): string | null =>
  timeText({ schedule: e.schedule ?? null, time: e.time } as unknown as CalendarEvent);

/** "$0", "$1,250.50": app/data fmt$. */
export const money = (dollars: number) => fmtUsd(dollars);

/** "New York (EST)": the web form's zone line. */
export function zoneLine(zone: string, abbr: string): string {
  const city = (zone.split("/").pop() ?? zone).replace(/_/g, " ");
  return `${city} (${abbr})`;
}

/* ── a type's colour (the web's typeColor.makeTypeVisuals + paper-programming.css) ─ */

export type TypeCat = { ink: string; fill: string; soft: string; bd: string };
const FALLBACK_HEX = "#8a8580";

function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => { const x = h.replace("#", ""); const f = x.length === 3 ? x.split("").map(ch => ch + ch).join("") : x; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0); };
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v * t + (B[i] ?? 0) * (1 - t))).join(",")})`;
}

/** --tc is the type's own hex (colorDark, else color); --tf 32% and --ts 13% of it over the card; the chip border half of it. */
export function typeCat(slug: string, types: readonly CalEventType[] | undefined, c: Palette): TypeCat {
  const t = types?.find(x => x.slug === slug);
  const hex = t?.colorDark ?? t?.color ?? FALLBACK_HEX;
  return { ink: hex, fill: mixHex(hex, c.card, 0.32), soft: mixHex(hex, c.card, 0.13), bd: mixHex(hex, c.card, 0.5) };
}
