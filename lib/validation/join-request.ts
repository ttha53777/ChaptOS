import { z } from "zod";

/**
 * Inputs for the join-request flow: one pre-auth (the person asking) and one
 * officer-side (the person deciding).
 */

/** Cap on the name typed into the join form. Roomy, but not a payload vector. */
export const JOIN_REQUEST_NAME_MAX = 80;

/**
 * POST /api/auth/request-join — filed by someone with a Supabase session but no
 * membership anywhere. The token IS the org resolution (they have no active org
 * to scope by), which is why it's part of the body rather than a header.
 */
export const submitJoinRequestInput = z.object({
  token: z.string().min(1, "Missing invite token"),
  name:  z.string().trim().min(1, "Name is required").max(JOIN_REQUEST_NAME_MAX),
});
export type SubmitJoinRequestInput = z.infer<typeof submitJoinRequestInput>;

/**
 * POST /api/join-requests/[id]/approve.
 *
 * `roleId` is a relational Role (permission bits + rank), not the free-text
 * Membership.role label — granting real authority is the point of asking at all,
 * and Membership.role only renders for members holding no Role rows anyway
 * (see roleTitle() in app/data.ts). null means "admit them with no role", which
 * leaves Membership.role at its default and grants nothing.
 *
 * The service rank-guards this: an officer can only grant roles ranked strictly
 * below their own highest. Validation can't do that check — it needs the caller.
 */
export const approveJoinRequestInput = z.object({
  roleId: z.number().int().positive().nullable().default(null),
});
export type ApproveJoinRequestInput = z.infer<typeof approveJoinRequestInput>;
