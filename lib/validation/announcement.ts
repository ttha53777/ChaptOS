import { z } from "zod";

const httpsUrl = z.string().refine(
  s => { try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } },
  { message: "ctaUrl must be http(s)" },
);

export const upsertAnnouncementInput = z.object({
  title:      z.string().trim().min(1).max(120),
  body:       z.string().max(2000).default(""),
  ctaLabel:   z.string().trim().max(40).optional(),
  ctaUrl:     httpsUrl.optional(),
  authorName: z.string().trim().max(80).optional(),
}).refine(
  d => (d.ctaLabel && d.ctaUrl) || (!d.ctaLabel && !d.ctaUrl),
  { message: "ctaLabel and ctaUrl must be provided together", path: ["ctaLabel"] },
);
export type UpsertAnnouncementInput = z.infer<typeof upsertAnnouncementInput>;
