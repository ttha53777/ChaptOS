import { z } from "zod";

// Input for POST /api/invites (admin generates an org invite link).
//
// There is no `mode` any more. It used to choose between "redeeming creates a
// new member" and "redeeming routes into the name-match claim flow"; the second
// only existed to serve officer-typed roster rows, which are gone. Every link is
// now the same shape and produces a JoinRequest an officer reviews.
//
//   expiry  — a preset; mapped to an absolute expiresAt server-side via
//             expiryToDate(). "never" → null (no expiry).
//   label   — the admin's own name for the link. Optional; blank is normalized
//             to undefined so an untouched input doesn't store an empty string.
//   maxUses — redemption cap. Optional; undefined = unlimited. Bounded at 500
//             because it's a chapter roster, not a public signup funnel.
export const INVITE_EXPIRY_PRESETS = ["20m", "1d", "7d", "14d", "never"] as const;
export type InviteExpiry = (typeof INVITE_EXPIRY_PRESETS)[number];

export const INVITE_LABEL_MAX = 60;
export const INVITE_MAX_USES_CEILING = 500;

export const createInviteInput = z.object({
  expiry: z.enum(INVITE_EXPIRY_PRESETS),
  label:  z.string().trim().max(INVITE_LABEL_MAX)
           .transform(s => (s === "" ? undefined : s))
           .optional(),
  // .nullish() (not .optional().transform()) so the KEY stays optional in the
  // inferred type — a transform would make callers pass `maxUses: undefined`
  // explicitly. Both null and undefined mean "no cap"; the service normalizes.
  maxUses: z.number().int().positive().max(INVITE_MAX_USES_CEILING).nullish(),
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
