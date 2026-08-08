/**
 * The treasury's org-level settings. Today that is one number: what was in the
 * account when the org started keeping books here.
 *
 * Separate from org-config-service even though the column lives on
 * OrganizationConfig, because every setter there gates on isOrgAdmin and this one
 * belongs to whoever holds MANAGE_TREASURY — the treasurer knows the bank balance;
 * the president doesn't necessarily.
 */
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError } from "@/lib/errors";
import { toCents } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";
import type { UpdateTreasurySettingsInput } from "@/lib/validation/treasury-settings";

export interface TreasurySettingsDTO {
  openingBalance: number | null;
  /** Whether anyone has answered. `openingBalance === 0` is an answer; null isn't. */
  configured: boolean;
}

function requireTreasury(ctx: RequestContext) {
  const allowed = ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_TREASURY");
  if (!allowed) throw new ForbiddenError("Only a treasurer can change the opening balance");
}

export async function getTreasurySettings(ctx: RequestContext): Promise<TreasurySettingsDTO> {
  const config = await ctx.db.organizationConfig.find();
  const openingBalance = config?.openingBalance ?? null;
  return { openingBalance, configured: openingBalance !== null };
}

export async function setOpeningBalance(
  ctx: RequestContext,
  input: UpdateTreasurySettingsInput,
): Promise<TreasurySettingsDTO> {
  requireTreasury(ctx);

  // upsert, not update, so a legacy org whose config row was never provisioned
  // self-heals rather than throwing P2025 — same reasoning as org-config-service.
  await ctx.db.organizationConfig.upsert({
    openingBalance:      input.openingBalance,
    openingBalanceCents: BigInt(toCents(input.openingBalance)),
  });

  await emit(ctx, "treasury.opening_balance.set", { type: "Organization", id: ctx.orgId }, {
    openingBalance: input.openingBalance,
  });

  return { openingBalance: input.openingBalance, configured: true };
}
