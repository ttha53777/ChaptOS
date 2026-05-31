import { z } from "zod";
import { MAX_SLUG_LEN, MIN_SLUG_LEN } from "@/lib/slug-rules";
import { ORG_TYPE_IDS } from "@/lib/org-types";

// Input for POST /api/orgs (self-serve org creation).
//
// Format-only checks here. Two checks still happen server-side after parsing:
//   * Slug uniqueness (DB query) — can't be done in Zod.
//   * Reserved-slug + profanity-list check — done with validateSlugFormat()
//     so the same rules also apply to the live slug-check endpoint.
//
// We deliberately do NOT lowercase or sanitize input here. The route returns
// a clear 400 for bad casing/whitespace so the client can surface the exact
// reason rather than silently mutating user input.
export const createOrgInput = z.object({
  name:        z.string().trim().min(1, "Organization name is required").max(120, "Name must be at most 120 characters"),
  slug:        z.string().trim().min(MIN_SLUG_LEN).max(MAX_SLUG_LEN),
  orgType:     z.string().refine((v) => ORG_TYPE_IDS.includes(v), { message: "Unknown organization type" }),
  founderName: z.string().trim().min(1, "Your name is required").max(120, "Name must be at most 120 characters"),
});

export type CreateOrgInput = z.infer<typeof createOrgInput>;
