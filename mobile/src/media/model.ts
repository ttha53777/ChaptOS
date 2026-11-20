/**
 * Media's rules: the shared module (lib/media/calendar, which the web page renders from)
 * plus what only the phone needs: the permission check, the pastel each format and lane
 * wears, and the old names lab/ and More's glance still call.
 *
 * Writes are MANAGE_INSTAGRAM (1<<4), what the routes check.
 */
import type { InstagramPost, MeResponse } from "@/lib/api-types";
import { instagramDays, instagramLane, instagramSummary, lanePosts, LANES, metrics, todayIn, type DuePillKind, type InstagramLane, type Metric } from "@/lib/media/calendar";
import type { Tone } from "~/theme/palette";

export * from "@/lib/media/calendar";

const MANAGE_INSTAGRAM = 1 << 4;
export const canManage = (me: MeResponse) => me.isAdmin || (me.permissions & MANAGE_INSTAGRAM) !== 0;

export type Lane = InstagramLane;
export type Measure = Metric;
export const FORMATS = ["Story", "Reel", "Carousel"] as const;
/** Story rose · Reel lilac · Carousel sky; a retired format is grey (null). */
export const formatTone = (t: string): Tone | null => (t === "Story" ? "rose" : t === "Reel" ? "lilac" : t === "Carousel" ? "sky" : null);
/** The lane head's square: overdue peach · this week butter · upcoming grey · posted mint. */
export const LANE_TONE: Record<Lane, Tone | null> = { overdue: "peach", week: "butter", upcoming: null, posted: "mint" };
export const PILL_TONE: Record<DuePillKind, Tone | null> = { late: "peach", soon: "butter", cool: null, ok: "mint" };

/** The org's today (the clock read here, at the edge). */
export const mediaToday = (timeZone?: string | null, now = new Date()) => todayIn(timeZone, now);

/* Older names (lab/media.tsx, More's glance). */
export const days = instagramDays;
export const laneOf = instagramLane;
export const summary = instagramSummary;
export const measures = metrics;
export function lanes(posts: InstagramPost[], today: string) {
  return LANES.map(lane => ({ lane: { ...lane, tone: LANE_TONE[lane.id] }, posts: lanePosts(posts, lane.id, today) })).filter(l => l.posts.length);
}
