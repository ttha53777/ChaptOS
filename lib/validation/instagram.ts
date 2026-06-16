import { z } from "zod";
import { DATE_RE } from "@/lib/dates";

// Canonical post types — the single source of truth for the allowed values.
// Re-used by the AI tools (IG_TYPES) and the data layer's InstagramTask.type.
export const INSTAGRAM_TYPES = ["Story", "Reel", "Carousel"] as const;
export type InstagramType = (typeof INSTAGRAM_TYPES)[number];
const instagramType = z.enum(INSTAGRAM_TYPES);

export const createInstagramTaskInput = z.object({
  title:   z.string().trim().min(1).max(200),
  dueDate: z.string().regex(DATE_RE),
  status:  z.string().min(1),
  type:    instagramType,
});
export type CreateInstagramTaskInput = z.infer<typeof createInstagramTaskInput>;

export const updateInstagramTaskInput = z.object({
  title:   z.string().trim().min(1).max(200).optional(),
  dueDate: z.string().regex(DATE_RE).optional(),
  status:  z.string().min(1).optional(),
  type:    instagramType.optional(),
});
export type UpdateInstagramTaskInput = z.infer<typeof updateInstagramTaskInput>;
