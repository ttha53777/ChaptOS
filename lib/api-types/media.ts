/**
 * Media (the content calendar; the page was "Instagram"): GET /api/instagram and its
 * writes (MANAGE_INSTAGRAM).
 *
 * A post is planned with a date and a format and lands in a lane by that date
 * (lib/instagram-planner: overdue · this week · upcoming · posted). Urgency is
 * computed from dueDate, never stored. "Mark posted" sets status "posted" and, with
 * no postedDate sent, the org-local today.
 */
export interface InstagramPost {
  id: number;
  title: string;
  /** YYYY-MM-DD: the planned day; drives the lane. */
  dueDate: string;
  /** YYYY-MM-DD the post went live; null until posted (and on older posted rows). */
  postedDate: string | null;
  /** "open" | "posted" (lib/state/instagram-status). */
  status: "open" | "posted";
  /** "Story" | "Reel" | "Carousel"; older rows may keep a retired format, kept until changed. */
  type: string;
  /** The calendar event this post promotes; null = none. */
  calendarEventId: number | null;
}
