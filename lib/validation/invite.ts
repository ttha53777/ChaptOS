import { z } from "zod";
import { INVITE_MODES } from "@/lib/state";

// Input for POST /api/invites (admin generates an org invite link).
//
//   mode   — "open" (redeeming creates a new Brother + Membership) or
//            "claim" (routes the redeemer into the name-match claim flow).
//   expiry — a preset; mapped to an absolute expiresAt server-side via
//            expiryToDate(). "never" → null (no expiry).
export const INVITE_EXPIRY_PRESETS = ["20m", "1d", "7d", "14d", "never"] as const;
export type InviteExpiry = (typeof INVITE_EXPIRY_PRESETS)[number];

export const createInviteInput = z.object({
  mode:   z.enum(INVITE_MODES as readonly [string, ...string[]]),
  expiry: z.enum(INVITE_EXPIRY_PRESETS),
});

export type CreateInviteInput = z.infer<typeof createInviteInput>;

/**
 * Map an expiry preset to an absolute expiry instant. "never" → null. Pure;
 * lives here (not the service) so it's bound to the enum and avoids a
 * service↔validation import cycle. The redeem-time expiry CHECK is independent
 * (just `expiresAt && expiresAt < now`).
 */
const PRESET_MS: Record<Exclude<InviteExpiry, "never">, number> = {
  "20m": 20 * 60_000,
  "1d":  24 * 60 * 60_000,
  "7d":  7 * 24 * 60 * 60_000,
  "14d": 14 * 24 * 60 * 60_000,
};

export function expiryToDate(preset: InviteExpiry, now: Date = new Date()): Date | null {
  if (preset === "never") return null;
  return new Date(now.getTime() + PRESET_MS[preset]);
}
