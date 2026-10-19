import { z } from "zod";

/** The word a person types to confirm deleting their own account. */
export const DELETE_ACCOUNT_CONFIRMATION = "DELETE";

// DELETE /api/auth/account. A fixed word rather than the account email: the
// native app has to render the same prompt, and a typed email is a worse
// speed bump than a typed verb for an action this final.
export const deleteAccountInput = z.object({
  confirm: z.string().refine(v => v.trim() === DELETE_ACCOUNT_CONFIRMATION, {
    message: `Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm`,
  }),
});
