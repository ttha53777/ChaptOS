import { z } from "zod";
import { httpsUrl } from "./shared";

export const upsertAnnouncementInput = z.object({
  title:      z.string().trim().min(1).max(120),
  body:       z.string().max(2000).default(""),
  // The editor sends `null` (not an omitted key) to clear a CTA, so accept
  // string | null | undefined. The route normalizes with `?? null` either way.
  ctaLabel:   z.string().trim().max(40).nullish(),
  ctaUrl:     httpsUrl("ctaUrl must be http(s)").nullish(),
  authorName: z.string().trim().max(80).optional(),
}).refine(
  d => (d.ctaLabel && d.ctaUrl) || (!d.ctaLabel && !d.ctaUrl),
  { message: "ctaLabel and ctaUrl must be provided together", path: ["ctaLabel"] },
);
