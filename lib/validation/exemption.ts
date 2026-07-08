import { z } from "zod";
import { EXEMPTION_REASONS } from "@/lib/state";

export const setExemptionInput = z.object({
  brotherId: z.number().int().positive(),
  /** Defaults to the org's active semester when omitted. */
  semesterId: z.number().int().positive().optional(),
  reason: z.enum(EXEMPTION_REASONS as unknown as [string, ...string[]]),
  note: z.string().trim().max(1000).optional(),
});
export type SetExemptionInput = z.infer<typeof setExemptionInput>;
