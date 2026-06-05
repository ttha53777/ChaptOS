import { z } from "zod";
import { httpsUrl } from "./shared";

export const upsertAnnouncementInput = z.object({
  title:      z.string().trim().min(1).max(120),
  body:       z.string().max(2000).default(""),
  ctaLabel:   z.string().trim().max(40).optional(),
  ctaUrl:     httpsUrl("ctaUrl must be http(s)").optional(),
  authorName: z.string().trim().max(80).optional(),
}).refine(
  d => (d.ctaLabel && d.ctaUrl) || (!d.ctaLabel && !d.ctaUrl),
  { message: "ctaLabel and ctaUrl must be provided together", path: ["ctaLabel"] },
);
export type UpsertAnnouncementInput = z.infer<typeof upsertAnnouncementInput>;
