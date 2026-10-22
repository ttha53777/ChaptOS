// Activity and announcement wire shapes. Type-only: see lib/api-types/index.ts for the rules.
import type { ActivityCategory } from "@/lib/activity-category";

/** GET /api/activity (`?limit=&before=&since=` page through older rows). */
export interface ActivityEntry {
  id: number;
  message: string;
  /** Relative, e.g. "3h ago". */
  timestamp: string;
  /** The exact instant, ISO 8601. */
  at: string;
  /** The Brother who did it, or null for a system row. */
  actorId: number | null;
  type: "success" | "warning" | "info";
  /** What the row is about, or null when unknown. */
  category?: ActivityCategory | null;
}

/** GET /api/announcement — the org's one dashboard announcement, or null. */
export type Announcement = {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  authorName: string | null;
  updatedAt: string;
} | null;
