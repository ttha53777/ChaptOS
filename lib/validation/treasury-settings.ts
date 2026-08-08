import { z } from "zod";

export const updateTreasurySettingsInput = z.object({
  // Negative is allowed on purpose: an org can start in the hole, and refusing to
  // record that would just push the lie into the first transaction instead.
  openingBalance: z.coerce.number().finite(),
});

export type UpdateTreasurySettingsInput = z.infer<typeof updateTreasurySettingsInput>;
