/**
 * Fundraisers' rules and words come from lib/fundraising/ledger (shared with the web,
 * app/org/[slug]/fundraisers). This file adds what only the app needs: who can manage, and
 * how a refused write is put into words.
 */
import type { MeResponse } from "@/lib/api-types";
import { ApiError } from "~/api/errors";

export * from "@/lib/fundraising/ledger";

const MANAGE_FUNDRAISING = 1 << 14;
export const canFund = (me: MeResponse) => me.isAdmin || (me.permissions & MANAGE_FUNDRAISING) !== 0;

/** The web's errorText: the API's own sentence when it sent one, else the fallback. */
export function errorText(e: unknown, fallback: string): string {
  const body = e instanceof ApiError ? (e.body as { error?: unknown } | null) : null;
  return typeof body?.error === "string" ? body.error : fallback;
}
